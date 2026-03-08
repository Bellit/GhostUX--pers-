// Simple CommonJS server for local testing with older Node versions
const fastify = require('fastify')

const server = fastify({ logger: true })

server.get('/', function (req, reply) {
  reply.send({ status: 'ok', service: 'ghostux-backend-js' })
})

var events = []

server.post('/ingest', function (request, reply) {
  var payload = null
  try {
    if (request.body && typeof request.body === 'object') payload = request.body
    else payload = JSON.parse(String(request.body || '{}'))
  } catch (err) {
    payload = { raw: String(request.body) }
  }
  function genId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9) }
  if (Array.isArray(payload)) {
    var added = []
    payload.forEach(function(p) {
      var ev = Object.assign({ receivedAt: Date.now(), eventId: p && p.eventId ? p.eventId : genId() }, p)
      events.push(ev)
      added.push(ev)
    })
    server.log.info({ added: added }, 'ingested batch')
  } else {
    var event = Object.assign({ receivedAt: Date.now(), eventId: payload && payload.eventId ? payload.eventId : genId() }, payload)
    events.push(event)
    server.log.info({ event: event }, 'ingested event')
  }
  reply.header('Access-Control-Allow-Origin', '*')
  reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  reply.header('Access-Control-Allow-Headers', 'Content-Type')
  reply.code(204).send()
})

server.options('/ingest', function (request, reply) {
  reply.header('Access-Control-Allow-Origin', '*')
  reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  reply.header('Access-Control-Allow-Headers', 'Content-Type')
  reply.code(204).send()
})

server.get('/events', function (request, reply) {
  reply.header('Access-Control-Allow-Origin', '*')
  var last = events.slice(-50)
  reply.send({ count: events.length, events: last })
})

server.listen(3000, '0.0.0.0', function (err, address) {
  if (err) {
    server.log.error(err)
    process.exit(1)
  }
})
