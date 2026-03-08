// Plain Node.js HTTP server for local testing without external deps
const http = require('http')
const url = require('url')
const fs = require('fs')
const path = require('path')

var events = []
var seenIds = new Set()
var failIngest = false
const DATA_DIR = path.join(__dirname, 'data')
const EVENTS_LOG = path.join(DATA_DIR, 'events.log')

try { fs.mkdirSync(DATA_DIR, { recursive: true }) } catch (e) {}
// load persisted events (JSONL)
try {
  if (fs.existsSync(EVENTS_LOG)) {
    const content = fs.readFileSync(EVENTS_LOG, 'utf8')
    content.split('\n').forEach((line) => {
      if (!line) return
      try {
        const ev = JSON.parse(line)
        events.push(ev)
        if (ev && ev.eventId) seenIds.add(ev.eventId)
      } catch (e) { /* ignore */ }
    })
  }
} catch (e) { console.error('Error loading persisted events', e) }

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
      res.writeHead(500, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      })
      return res.end('simulated failure')
    }
    function genId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9) }
    function isValidEvent(e) {
      return e && typeof e.type === 'string' && (typeof e.ts === 'number' || typeof e.ts === 'bigint') && typeof e.pageUrl === 'string'
    }
    function appendToLog(ev) {
      try { fs.appendFileSync(EVENTS_LOG, JSON.stringify(ev) + '\n') } catch (e) { console.error('Failed to append event', e) }
    }
    if (Array.isArray(payload)) {
      for (var i = 0; i < payload.length; i++) {
        var p = payload[i]
        if (!isValidEvent(p)) continue
        var id = p && p.eventId ? p.eventId : genId()
        if (seenIds.has(id)) continue
        var ev = Object.assign({ receivedAt: Date.now(), eventId: id }, p)
        events.push(ev)
        seenIds.add(ev.eventId)
        appendToLog(ev)
        console.log('ingested event', ev)
      }
    } else {
      if (!isValidEvent(payload)) {
        return sendJSON(res, 400, { error: 'invalid event payload, required: type, ts, pageUrl' })
      }
      var id = payload && payload.eventId ? payload.eventId : genId()
      if (!seenIds.has(id)) {
        var event = Object.assign({ receivedAt: Date.now(), eventId: id }, payload)
        events.push(event)
        seenIds.add(event.eventId)
        appendToLog(event)
        console.log('ingested event', event)
      }
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

function handleDashboard(req, res) {
  const recent = events.slice(-100)
  let html = '<!doctype html><html><head><meta charset="utf-8"><title>GhostUX Dashboard</title></head><body>'
  html += '<h1>Recent events</h1>'
  html += '<table border="1" cellpadding="4" cellspacing="0"><tr><th>receivedAt</th><th>eventId</th><th>type</th><th>pageUrl</th></tr>'
  recent.forEach((ev) => {
    html += '<tr>' +
      '<td>' + new Date(ev.receivedAt).toISOString() + '</td>' +
      '<td>' + (ev.eventId || '') + '</td>' +
      '<td>' + (ev.type || '') + '</td>' +
      '<td>' + (ev.pageUrl ? ev.pageUrl.replace(/</g, '&lt;') : '') + '</td>' +
      '</tr>'
  })
  html += '</table></body></html>'
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
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
  if (p.pathname === '/dashboard' && req.method === 'GET') return handleDashboard(req, res)
  if (p.pathname === '/' && req.method === 'GET') return sendJSON(res, 200, { status: 'ok', service: 'ghostux-backend-plain' })

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

var port = process.env.PORT || 3000
server.listen(port, '0.0.0.0', function () {
  console.log('server listening on port', port)
})
