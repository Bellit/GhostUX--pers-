// Plain Node.js HTTP server for local testing without external deps
const http = require('http')
const url = require('url')

var events = []
var failIngest = false

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
    if (failIngest) {
      console.log('simulated ingest failure')
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      return res.end('simulated failure')
    }
    function genId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9) }
    if (Array.isArray(payload)) {
      for (var i = 0; i < payload.length; i++) {
        var p = payload[i]
        var ev = Object.assign({ receivedAt: Date.now(), eventId: p && p.eventId ? p.eventId : genId() }, p)
        events.push(ev)
        console.log('ingested event', ev)
      }
    } else {
      var event = Object.assign({ receivedAt: Date.now(), eventId: payload && payload.eventId ? payload.eventId : genId() }, payload)
      events.push(event)
      console.log('ingested event', event)
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    })
    res.end()
  })
}

function handleToggleFail(req, res) {
  var body = ''
  req.on('data', function (chunk) { body += chunk })
  req.on('end', function () {
    try {
      var obj = JSON.parse(body || '{}')
      if (typeof obj.fail === 'boolean') {
        failIngest = obj.fail
        console.log('set failIngest =', failIngest)
        sendJSON(res, 200, { failIngest: failIngest })
        return
      }
    } catch (e) {}
    sendJSON(res, 400, { error: 'invalid body, expected {"fail":true|false}' })
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
  if (p.pathname === '/toggle-fail' && req.method === 'POST') return handleToggleFail(req, res)
  if (p.pathname === '/events' && req.method === 'GET') return handleEvents(req, res)
  if (p.pathname === '/' && req.method === 'GET') return sendJSON(res, 200, { status: 'ok', service: 'ghostux-backend-plain' })

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

var port = process.env.PORT || 3000
server.listen(port, '0.0.0.0', function () {
  console.log('server listening on port', port)
})
