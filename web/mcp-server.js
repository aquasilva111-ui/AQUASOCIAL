const {Buffer} = require('node:buffer')
const fs = require('node:fs/promises')
const path = require('node:path')
const {origin, name} = require('./site-info')

const endpoint = '/mcp'
const cardPath = '/.well-known/mcp/server-card.json'
const versions = ['2025-11-25', '2025-06-18', '2025-03-26']
const serverInfo = {
  name: 'aqua-social',
  title: name,
  version: '1.0.0',
}
const capabilities = {tools: {}}
const tool = {
  name: 'get_aqua_site_guide',
  description:
    'Read the public AQUA site guide with feature, contact and terms links.',
  inputSchema: {type: 'object', properties: {}, additionalProperties: false},
  annotations: {readOnlyHint: true, openWorldHint: false},
}
const serverCard = {
  $schema:
    'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json',
  version: '1.0',
  protocolVersion: versions[0],
  serverInfo,
  description: tool.description,
  documentationUrl: `${origin}/llms.txt`,
  transport: {type: 'streamable-http', endpoint: `${origin}${endpoint}`},
  capabilities,
  authentication: {required: false, schemes: []},
  tools: [tool],
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, {'Content-Type': 'application/json', ...headers})
  res.end(JSON.stringify(body))
}

function rpcError(res, id, code, message, status = 200) {
  json(res, status, {jsonrpc: '2.0', id, error: {code, message}})
}

async function handleMcp(req, res, pathname, root) {
  if (pathname === cardPath) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
    if (req.method === 'OPTIONS' || req.method === 'HEAD') {
      res.writeHead(req.method === 'OPTIONS' ? 204 : 200, {
        'Content-Type': 'application/json',
        ...headers,
      })
      res.end()
    } else if (req.method === 'GET') {
      json(res, 200, serverCard, {
        ...headers,
        'Cache-Control': 'public, max-age=300',
      })
    } else {
      res.writeHead(405, {...headers, Allow: 'GET, HEAD, OPTIONS'}).end()
    }
    return
  }

  if (req.headers.origin && req.headers.origin !== origin) {
    return rpcError(res, null, -32000, 'Origin not allowed', 403)
  }
  if (req.method !== 'POST') {
    return res.writeHead(405, {Allow: 'POST'}).end()
  }
  const mediaType = req.headers['content-type']
    ?.split(';')[0]
    .trim()
    .toLowerCase()
  if (mediaType !== 'application/json') {
    return rpcError(res, null, -32600, 'Expected application/json', 415)
  }
  const protocol = req.headers['mcp-protocol-version']
  if (protocol && !versions.includes(protocol)) {
    return rpcError(res, null, -32600, 'Unsupported MCP protocol version', 400)
  }

  const chunks = []
  let size = 0
  for await (const chunk of req.iterator({destroyOnReturn: false})) {
    size += chunk.length
    if (size > 16 * 1024) {
      req.resume()
      return rpcError(res, null, -32600, 'Request too large', 413)
    }
    chunks.push(chunk)
  }

  let input
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return rpcError(res, null, -32700, 'Invalid JSON', 400)
  }
  const id = input?.id
  if (
    input?.jsonrpc !== '2.0' ||
    typeof input.method !== 'string' ||
    (id !== undefined && typeof id !== 'string' && !Number.isInteger(id))
  ) {
    return rpcError(res, null, -32600, 'Invalid JSON-RPC request', 400)
  }
  if (id === undefined) return res.writeHead(202).end()

  let result
  switch (input.method) {
    case 'initialize': {
      const requested = input.params?.protocolVersion
      result = {
        protocolVersion: versions.includes(requested) ? requested : versions[0],
        capabilities,
        serverInfo,
      }
      break
    }
    case 'ping':
      result = {}
      break
    case 'tools/list':
      result = {tools: [tool]}
      break
    case 'tools/call': {
      const args = input.params?.arguments
      if (
        input.params?.name !== tool.name ||
        (args !== undefined &&
          (!args ||
            typeof args !== 'object' ||
            Array.isArray(args) ||
            Object.keys(args).length !== 0))
      ) {
        return rpcError(res, id, -32602, 'Unknown tool or invalid arguments')
      }
      const text = await fs.readFile(path.join(root, 'llms.txt'), 'utf8')
      result = {content: [{type: 'text', text}]}
      break
    }
    default:
      return rpcError(res, id, -32601, 'Method not found')
  }
  json(res, 200, {jsonrpc: '2.0', id, result})
}

module.exports = {endpoint, cardPath, handleMcp}
