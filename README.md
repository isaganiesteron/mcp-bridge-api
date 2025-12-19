# MCP Bridge API

HTTP API bridge that connects TypingMind plugins to MCP servers (Google Ads, Meta Ads) via REST endpoints.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update `MCP_SERVER_URL` with your actual MCP server URL
   - Adjust other settings as needed

3. Start the server:
```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

## Configuration

Environment variables (configure in `.env`):

- `PORT` - Server port (default: 3000)
- `MCP_SERVER_URL` - URL of your MCP server (required)
- `CORS_ORIGIN` - Allowed CORS origins (use `*` for all, or comma-separated list)
- `API_KEY` - API key for authentication (required for production, generates a secure random string)

## Authentication

All API endpoints (except `/health`) require authentication using an API key.

### How to authenticate:

Include your API key in one of the following ways:

**Option 1: X-API-Key header**
```bash
curl -H "X-API-Key: your-api-key-here" http://localhost:3000/api/tools
```

**Option 2: Authorization Bearer token**
```bash
curl -H "Authorization: Bearer your-api-key-here" http://localhost:3000/api/tools
```

### Generating a secure API key:

You can generate a secure random API key using:

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OpenSSL
openssl rand -hex 32

# Or any password manager's random string generator
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and MCP connection state. **No authentication required.**

### List Available Tools
```
GET /api/tools
X-API-Key: your-api-key-here
```
Returns all available MCP tools with their definitions.

### List Google Ads Accounts
```
GET /api/google-ads/accounts
X-API-Key: your-api-key-here
```
Returns accessible Google Ads accounts.

### Execute GAQL Query
```
POST /api/google-ads/execute-gaql
Content-Type: application/json
X-API-Key: your-api-key-here

{
  "query": "SELECT campaign.id, campaign.name FROM campaign",
  "customer_id": "1234567890",
  "login_customer_id": "9876543210"  // optional
}
```
Executes a Google Ads Query Language query.

### Get GAQL Documentation
```
GET /api/google-ads/gaql-doc
X-API-Key: your-api-key-here
```
Returns GAQL documentation.

### Get Reporting View Documentation
```
GET /api/google-ads/reporting-view-doc?view=campaign
X-API-Key: your-api-key-here
```
Returns documentation for a specific reporting view (optional `view` parameter).

## Development

- Run `npm run dev` to start the server with auto-reload using nodemon
- The server will automatically restart when you make changes to the code

## Requirements

- Node.js v16 or higher
- A running MCP server with SSE transport

## Before Running

**IMPORTANT**: You must update the `MCP_SERVER_URL` in your `.env` file with a valid MCP server URL before starting the application. The placeholder URL will not work.
