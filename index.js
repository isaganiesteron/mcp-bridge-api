// Node.js API (Express example)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL;
const API_KEY = process.env.API_KEY;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Validate required environment variables
if (!MCP_SERVER_URL) {
  console.error('ERROR: MCP_SERVER_URL environment variable is required');
  process.exit(1);
}

if (!API_KEY && NODE_ENV === 'production') {
  console.error('ERROR: API_KEY environment variable is required in production');
  process.exit(1);
}

if (!API_KEY) {
  console.warn('WARNING: API_KEY not set - API is running without authentication (not recommended)');
}

// Middleware
app.use(express.json({ limit: '1mb' })); // Limit request body size to prevent abuse
app.use(cors({
  origin: process.env.CORS_ORIGIN === '*' ? '*' : process.env.CORS_ORIGIN?.split(',').map(o => o.trim())
}));

// API Key Authentication Middleware
function authenticateApiKey(req, res, next) {
  // Skip authentication if no API_KEY is configured (optional security)
  if (!API_KEY) {
    console.warn('Warning: API_KEY not set - API is running without authentication');
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide an API key via X-API-Key header or Authorization: Bearer <key>'
    });
  }

  // Use constant-time comparison to prevent timing attacks
  try {
    const apiKeyBuffer = Buffer.from(apiKey);
    const validKeyBuffer = Buffer.from(API_KEY);

    // Only compare if lengths match (also constant-time checked)
    if (apiKeyBuffer.length !== validKeyBuffer.length) {
      return res.status(403).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid'
      });
    }

    if (!crypto.timingSafeEqual(apiKeyBuffer, validKeyBuffer)) {
      return res.status(403).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid'
      });
    }
  } catch (error) {
    return res.status(403).json({
      error: 'Invalid API key',
      message: 'The provided API key is not valid'
    });
  }

  next();
}

// Initialize MCP client once
let mcpClient;

async function initMCPClient() {
  if (!MCP_SERVER_URL) {
    throw new Error('MCP_SERVER_URL environment variable is required');
  }

  console.log(`Connecting to MCP server at ${MCP_SERVER_URL}...`);

  const transport = new SSEClientTransport(
    new URL(MCP_SERVER_URL)
  );

  mcpClient = new Client({
    name: "api-bridge",
    version: "1.0.0"
  }, { capabilities: {} });

  await mcpClient.connect(transport);
  console.log('Successfully connected to MCP server');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mcpConnected: !!mcpClient,
    timestamp: new Date().toISOString()
  });
});

// List available tools from MCP server
app.get('/api/tools', authenticateApiKey, async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ error: 'MCP client not initialized' });
    }

    const tools = await mcpClient.listTools();
    res.json(tools);
  } catch (error) {
    console.error('Error listing tools:', error);
    res.status(500).json({ error: error.message });
  }
});

// List accessible Google Ads accounts
app.get('/api/google-ads/accounts', authenticateApiKey, async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ error: 'MCP client not initialized' });
    }

    const result = await mcpClient.callTool({
      name: "list_accessible_accounts",
      arguments: {}
    });

    res.json(result);
  } catch (error) {
    console.error('Error calling list_accessible_accounts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute GAQL query
app.post('/api/google-ads/execute-gaql', authenticateApiKey, async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ error: 'MCP client not initialized' });
    }

    const { query, customer_id, login_customer_id } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }

    const result = await mcpClient.callTool({
      name: "execute_gaql",
      arguments: {
        query,
        customer_id,
        login_customer_id: login_customer_id || null
      }
    });

    res.json(result);
  } catch (error) {
    console.error('Error calling execute_gaql:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get GAQL documentation
app.get('/api/google-ads/gaql-doc', authenticateApiKey, async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ error: 'MCP client not initialized' });
    }

    const result = await mcpClient.callTool({
      name: "get_gaql_doc",
      arguments: {}
    });

    res.json(result);
  } catch (error) {
    console.error('Error calling get_gaql_doc:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get reporting view documentation
app.get('/api/google-ads/reporting-view-doc', authenticateApiKey, async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ error: 'MCP client not initialized' });
    }

    const { view } = req.query;

    const result = await mcpClient.callTool({
      name: "get_reporting_view_doc",
      arguments: { view: view || null }
    });

    res.json(result);
  } catch (error) {
    console.error('Error calling get_reporting_view_doc:', error);
    res.status(500).json({ error: error.message });
  }
});

// 404 handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    availableEndpoints: [
      'GET /health',
      'GET /api/tools',
      'GET /api/google-ads/accounts',
      'POST /api/google-ads/execute-gaql',
      'GET /api/google-ads/gaql-doc',
      'GET /api/google-ads/reporting-view-doc'
    ]
  });
});

// Start server
let server;
try {
  await initMCPClient();
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Environment: ${NODE_ENV}`);
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  if (server) {
    server.close(async () => {
      console.log('HTTP server closed');

      // Close MCP client connection
      if (mcpClient) {
        try {
          await mcpClient.close();
          console.log('MCP client connection closed');
        } catch (error) {
          console.error('Error closing MCP client:', error);
        }
      }

      console.log('Graceful shutdown complete');
      process.exit(0);
    });

    // Force shutdown after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));