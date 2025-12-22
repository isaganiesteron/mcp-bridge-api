// Node.js API (Express example)
import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import crypto from "crypto"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000
const MCP_SERVER_URL = process.env.MCP_SERVER_URL
const API_KEY = process.env.API_KEY
const NODE_ENV = process.env.NODE_ENV || "development"

// Validate required environment variables
if (!MCP_SERVER_URL) {
	console.error("ERROR: MCP_SERVER_URL environment variable is required")
	process.exit(1)
}

if (!API_KEY && NODE_ENV === "production") {
	console.error("ERROR: API_KEY environment variable is required in production")
	process.exit(1)
}

if (!API_KEY) {
	console.warn("WARNING: API_KEY not set - API is running without authentication (not recommended)")
}

// Middleware
app.use(express.json({ limit: "1mb" })) // Limit request body size to prevent abuse
app.use(
	cors({
		origin: process.env.CORS_ORIGIN === "*" ? "*" : process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()),
	})
)

// API Key Authentication Middleware
function authenticateApiKey(req, res, next) {
	// Skip authentication if no API_KEY is configured (optional security)
	if (!API_KEY) {
		console.warn("Warning: API_KEY not set - API is running without authentication")
		return next()
	}

	const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "")

	if (!apiKey) {
		return res.status(401).json({
			error: "Authentication required",
			message: "Please provide an API key via X-API-Key header or Authorization: Bearer <key>",
		})
	}

	// Use constant-time comparison to prevent timing attacks
	try {
		const apiKeyBuffer = Buffer.from(apiKey)
		const validKeyBuffer = Buffer.from(API_KEY)

		// Only compare if lengths match (also constant-time checked)
		if (apiKeyBuffer.length !== validKeyBuffer.length) {
			return res.status(403).json({
				error: "Invalid API key",
				message: "The provided API key is not valid",
			})
		}

		if (!crypto.timingSafeEqual(apiKeyBuffer, validKeyBuffer)) {
			return res.status(403).json({
				error: "Invalid API key",
				message: "The provided API key is not valid",
			})
		}
	} catch (error) {
		return res.status(403).json({
			error: "Invalid API key",
			message: "The provided API key is not valid",
		})
	}

	next()
}

// Helper function to serialize error objects completely
function serializeError(error) {
	const errorObj = {
		message: error.message,
		name: error.name,
		code: error.code,
		data: error.data,
		stack: error.stack,
	}

	// Try to get all enumerable and non-enumerable properties
	try {
		const allProps = {}
		let obj = error
		do {
			Object.getOwnPropertyNames(obj).forEach((prop) => {
				if (!allProps[prop] && prop !== "stack") {
					try {
						allProps[prop] = obj[prop]
					} catch (e) {
						allProps[prop] = "[Cannot access]"
					}
				}
			})
		} while ((obj = Object.getPrototypeOf(obj)))
		errorObj.allProperties = allProps
	} catch (e) {
		errorObj.serializationError = e.message
	}

	return errorObj
}

// Initialize MCP client once
let mcpClient
let mcpTransport

async function initMCPClient() {
	if (!MCP_SERVER_URL) {
		throw new Error("MCP_SERVER_URL environment variable is required")
	}

	console.log("[MCP INIT] ========================================")
	console.log("[MCP INIT] Starting MCP client initialization")
	console.log("[MCP INIT] Node version:", process.version)
	console.log("[MCP INIT] Environment:", NODE_ENV)
	console.log("[MCP INIT] MCP_SERVER_URL:", MCP_SERVER_URL)

	try {
		const serverUrl = new URL(MCP_SERVER_URL)
		console.log("[MCP INIT] Parsed URL details:", {
			protocol: serverUrl.protocol,
			host: serverUrl.host,
			hostname: serverUrl.hostname,
			port: serverUrl.port,
			pathname: serverUrl.pathname,
			search: serverUrl.search,
			href: serverUrl.href,
		})
	} catch (urlError) {
		console.error("[MCP INIT] ERROR: Invalid MCP_SERVER_URL:", urlError.message)
		throw urlError
	}

	console.log("[MCP INIT] Creating SSEClientTransport...")
	try {
		mcpTransport = new SSEClientTransport(new URL(MCP_SERVER_URL))
		console.log("[MCP INIT] Transport created successfully")
		console.log("[MCP INIT] Transport type:", mcpTransport.constructor.name)

		// Log transport properties if accessible
		if (mcpTransport && typeof mcpTransport === "object") {
			const transportProps = Object.getOwnPropertyNames(Object.getPrototypeOf(mcpTransport))
			console.log(
				"[MCP INIT] Transport methods:",
				transportProps.filter((p) => typeof mcpTransport[p] === "function")
			)
		}
	} catch (transportError) {
		console.error("[MCP INIT] ERROR: Failed to create transport:", serializeError(transportError))
		throw transportError
	}

	console.log("[MCP INIT] Creating MCP Client...")
	try {
		mcpClient = new Client(
			{
				name: "api-bridge",
				version: "1.0.0",
			},
			{ capabilities: {} }
		)
		console.log("[MCP INIT] Client created successfully")
	} catch (clientError) {
		console.error("[MCP INIT] ERROR: Failed to create client:", serializeError(clientError))
		throw clientError
	}

	console.log("[MCP INIT] Attempting to connect...")
	try {
		await mcpClient.connect(mcpTransport)
		console.log("[MCP INIT] ✓ Successfully connected to MCP server")

		// Test connection immediately with listTools
		console.log("[MCP INIT] Testing connection with listTools()...")
		try {
			const testStartTime = Date.now()
			const testTools = await mcpClient.listTools()
			const testDuration = Date.now() - testStartTime
			console.log("[MCP INIT] ✓ Connection test successful")
			console.log("[MCP INIT] Test duration:", testDuration, "ms")
			console.log("[MCP INIT] Tools available:", testTools.tools?.length || 0)
			if (testTools.tools && testTools.tools.length > 0) {
				console.log("[MCP INIT] Tool names:", testTools.tools.map((t) => t.name).join(", "))
			}
		} catch (testError) {
			console.error("[MCP INIT] ✗ Connection test FAILED")
			console.error("[MCP INIT] Test error details:", JSON.stringify(serializeError(testError), null, 2))
			// Don't throw here - let the server start, but log the issue
		}
	} catch (connectError) {
		console.error("[MCP INIT] ✗ Failed to connect to MCP server")
		console.error("[MCP INIT] Connection error details:", JSON.stringify(serializeError(connectError), null, 2))
		throw connectError
	}

	console.log("[MCP INIT] ========================================")
}

// Health check endpoint
app.get("/health", (req, res) => {
	res.json({
		status: "ok",
		mcpConnected: !!mcpClient,
		timestamp: new Date().toISOString(),
	})
})

// List available tools from MCP server
app.get("/api/tools", authenticateApiKey, async (req, res) => {
	const requestId = Date.now().toString(36)
	console.log(`[${requestId}] [API] GET /api/tools - Starting request`)

	try {
		if (!mcpClient) {
			console.error(`[${requestId}] [API] MCP client not initialized`)
			return res.status(503).json({ error: "MCP client not initialized" })
		}

		console.log(`[${requestId}] [API] Calling mcpClient.listTools()...`)
		const startTime = Date.now()

		const tools = await mcpClient.listTools()

		const duration = Date.now() - startTime
		console.log(`[${requestId}] [API] ✓ listTools() completed in ${duration}ms`)
		console.log(`[${requestId}] [API] Tools count:`, tools.tools?.length || 0)

		res.json(tools)
	} catch (error) {
		console.error(`[${requestId}] [API] ✗ Error listing tools`)
		console.error(`[${requestId}] [API] Error details:`, JSON.stringify(serializeError(error), null, 2))

		res.status(500).json({
			error: error.message,
			code: error.code,
			data: error.data,
			requestId: requestId,
		})
	}
})

// List accessible Google Ads accounts
app.get("/api/google-ads/accounts", authenticateApiKey, async (req, res) => {
	const requestId = Date.now().toString(36)
	console.log(`[${requestId}] [API] GET /api/google-ads/accounts - Starting request`)
	console.log(`[${requestId}] [API] Query params:`, req.query)

	try {
		if (!mcpClient) {
			console.error(`[${requestId}] [API] MCP client not initialized`)
			return res.status(503).json({ error: "MCP client not initialized" })
		}

		const toolCall = {
			name: "list_accessible_accounts",
			arguments: {},
		}

		console.log(`[${requestId}] [API] Calling mcpClient.callTool()`)
		console.log(`[${requestId}] [API] Tool call payload:`, JSON.stringify(toolCall, null, 2))

		const startTime = Date.now()
		const result = await mcpClient.callTool(toolCall)
		const duration = Date.now() - startTime

		console.log(`[${requestId}] [API] ✓ callTool() completed in ${duration}ms`)
		console.log(`[${requestId}] [API] Result type:`, result?.isError ? "ERROR" : "SUCCESS")
		if (result?.isError) {
			console.error(`[${requestId}] [API] Result contains error:`, JSON.stringify(result, null, 2))
		} else {
			console.log(`[${requestId}] [API] Result preview:`, JSON.stringify(result).substring(0, 200))
		}

		res.json(result)
	} catch (error) {
		console.error(`[${requestId}] [API] ✗ Error calling list_accessible_accounts`)
		console.error(`[${requestId}] [API] Error details:`, JSON.stringify(serializeError(error), null, 2))
		console.error(`[${requestId}] [API] Attempted tool call:`, {
			name: "list_accessible_accounts",
			arguments: {},
		})

		res.status(500).json({
			error: error.message,
			code: error.code,
			data: error.data,
			requestId: requestId,
		})
	}
})

// Execute GAQL query
app.post("/api/google-ads/execute-gaql", authenticateApiKey, async (req, res) => {
	const requestId = Date.now().toString(36)
	console.log(`[${requestId}] [API] POST /api/google-ads/execute-gaql - Starting request`)

	try {
		if (!mcpClient) {
			console.error(`[${requestId}] [API] MCP client not initialized`)
			return res.status(503).json({ error: "MCP client not initialized" })
		}

		const { query, customer_id, login_customer_id } = req.body
		console.log(`[${requestId}] [API] Request body:`, {
			query: query?.substring(0, 100) + "...",
			customer_id,
			login_customer_id,
		})

		if (!query) {
			return res.status(400).json({ error: "query is required" })
		}

		if (!customer_id) {
			return res.status(400).json({ error: "customer_id is required" })
		}

		const toolCall = {
			name: "execute_gaql",
			arguments: {
				query,
				customer_id,
				login_customer_id: login_customer_id || null,
			},
		}

		console.log(`[${requestId}] [API] Calling mcpClient.callTool()`)
		console.log(
			`[${requestId}] [API] Tool call payload:`,
			JSON.stringify(
				{
					...toolCall,
					arguments: {
						...toolCall.arguments,
						query: toolCall.arguments.query.substring(0, 100) + "...",
					},
				},
				null,
				2
			)
		)

		const startTime = Date.now()
		const result = await mcpClient.callTool(toolCall)
		const duration = Date.now() - startTime

		console.log(`[${requestId}] [API] ✓ callTool() completed in ${duration}ms`)
		console.log(`[${requestId}] [API] Result type:`, result?.isError ? "ERROR" : "SUCCESS")

		res.json(result)
	} catch (error) {
		console.error(`[${requestId}] [API] ✗ Error calling execute_gaql`)
		console.error(`[${requestId}] [API] Error details:`, JSON.stringify(serializeError(error), null, 2))

		res.status(500).json({
			error: error.message,
			code: error.code,
			data: error.data,
			requestId: requestId,
		})
	}
})

// Get GAQL documentation
app.get("/api/google-ads/gaql-doc", authenticateApiKey, async (req, res) => {
	const requestId = Date.now().toString(36)
	console.log(`[${requestId}] [API] GET /api/google-ads/gaql-doc - Starting request`)

	try {
		if (!mcpClient) {
			console.error(`[${requestId}] [API] MCP client not initialized`)
			return res.status(503).json({ error: "MCP client not initialized" })
		}

		const toolCall = {
			name: "get_gaql_doc",
			arguments: {},
		}

		console.log(`[${requestId}] [API] Calling mcpClient.callTool()`)
		console.log(`[${requestId}] [API] Tool call payload:`, JSON.stringify(toolCall, null, 2))

		const startTime = Date.now()
		const result = await mcpClient.callTool(toolCall)
		const duration = Date.now() - startTime

		console.log(`[${requestId}] [API] ✓ callTool() completed in ${duration}ms`)

		res.json(result)
	} catch (error) {
		console.error(`[${requestId}] [API] ✗ Error calling get_gaql_doc`)
		console.error(`[${requestId}] [API] Error details:`, JSON.stringify(serializeError(error), null, 2))

		res.status(500).json({
			error: error.message,
			code: error.code,
			data: error.data,
			requestId: requestId,
		})
	}
})

// Get reporting view documentation
app.get("/api/google-ads/reporting-view-doc", authenticateApiKey, async (req, res) => {
	const requestId = Date.now().toString(36)
	console.log(`[${requestId}] [API] GET /api/google-ads/reporting-view-doc - Starting request`)
	console.log(`[${requestId}] [API] Query params:`, req.query)

	try {
		if (!mcpClient) {
			console.error(`[${requestId}] [API] MCP client not initialized`)
			return res.status(503).json({ error: "MCP client not initialized" })
		}

		const { view } = req.query

		const toolCall = {
			name: "get_reporting_view_doc",
			arguments: { view: view || null },
		}

		console.log(`[${requestId}] [API] Calling mcpClient.callTool()`)
		console.log(`[${requestId}] [API] Tool call payload:`, JSON.stringify(toolCall, null, 2))

		const startTime = Date.now()
		const result = await mcpClient.callTool(toolCall)
		const duration = Date.now() - startTime

		console.log(`[${requestId}] [API] ✓ callTool() completed in ${duration}ms`)

		res.json(result)
	} catch (error) {
		console.error(`[${requestId}] [API] ✗ Error calling get_reporting_view_doc`)
		console.error(`[${requestId}] [API] Error details:`, JSON.stringify(serializeError(error), null, 2))

		res.status(500).json({
			error: error.message,
			code: error.code,
			data: error.data,
			requestId: requestId,
		})
	}
})

// 404 handler for undefined routes
app.use((req, res, next) => {
	res.status(404).json({
		error: "Not Found",
		message: `Route ${req.method} ${req.path} not found`,
		availableEndpoints: ["GET /health", "GET /api/tools", "GET /api/google-ads/accounts", "POST /api/google-ads/execute-gaql", "GET /api/google-ads/gaql-doc", "GET /api/google-ads/reporting-view-doc"],
	})
})

// Start server
let server
try {
	await initMCPClient()
	server = app.listen(PORT, () => {
		console.log("========================================")
		console.log(`✓ Server running on port ${PORT}`)
		console.log(`✓ Health check: http://localhost:${PORT}/health`)
		console.log(`✓ Environment: ${NODE_ENV}`)
		console.log("========================================")
	})
} catch (error) {
	console.error("========================================")
	console.error("✗ Failed to start server")
	console.error("Error details:", JSON.stringify(serializeError(error), null, 2))
	console.error("========================================")
	process.exit(1)
}

// Graceful shutdown handler
async function gracefulShutdown(signal) {
	console.log(`\n${signal} received. Starting graceful shutdown...`)

	// Stop accepting new connections
	if (server) {
		server.close(async () => {
			console.log("HTTP server closed")

			// Close MCP client connection
			if (mcpClient) {
				try {
					await mcpClient.close()
					console.log("MCP client connection closed")
				} catch (error) {
					console.error("Error closing MCP client:", error)
				}
			}

			console.log("Graceful shutdown complete")
			process.exit(0)
		})

		// Force shutdown after 10 seconds if graceful shutdown fails
		setTimeout(() => {
			console.error("Could not close connections in time, forcefully shutting down")
			process.exit(1)
		}, 10000)
	} else {
		process.exit(0)
	}
}

// Register shutdown handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))
