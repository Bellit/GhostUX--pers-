// Plain Node.js HTTP server for local testing without external deps
const http = require('http')
const url = require('url')

var events = []

function sendJSON(res, status, obj) {
  var payload = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(payload)
}

function handleIngest(req, res) {
  var body = ''
  req.on('data', function (chunk) { body += chunk })
  req.on('end', function () {
    var payload = null
    try {
      payload = JSON.parse(body || '{}')
    } catch (err) {
      payload = { raw: body }
    }
    var event = Object.assign({ receivedAt: Date.now() }, payload)
    events.push(event)
    console.log('ingested event', event)
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    })
    res.end()
  })
}

function handleEvents(req, res) {
  sendJSON(res, 200, { count: events.length, events: events.slice(-50) })
}

var server = http.createServer(function (req, res) {
  var p = url.parse(req.url, true)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    })
    return res.end()
  }

  if (p.pathname === '/ingest' && req.method === 'POST') return handleIngest(req, res)
  if (p.pathname === '/events' && req.method === 'GET') return handleEvents(req, res)
  if (p.pathname === '/' && req.method === 'GET') return sendJSON(res, 200, { status: 'ok', service: 'ghostux-backend-plain' })

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

var port = process.env.PORT || 3000
server.listen(port, '0.0.0.0', function () {
  console.log('server listening on port', port)
})
