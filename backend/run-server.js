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
  var event = Object.assign({ receivedAt: Date.now() }, payload)
  events.push(event)
  server.log.info({ event: event }, 'ingested event')
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
