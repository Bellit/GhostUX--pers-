import Fastify from 'fastify'

const server = Fastify({ logger: true })

server.get('/', async () => {
  return { status: 'ok', service: 'ghostux-backend' }
})

// In-memory event store (for local testing only)
const events: Array<Record<string, any>> = []

// Ingest endpoint: accepts JSON or raw body, stores event in memory
server.post('/ingest', async (request, reply) => {
  let payload: any = null
  try {
    payload = request.body && typeof request.body === 'object' ? request.body : JSON.parse(String(request.body || '{}'))
  } catch (err) {
    payload = { raw: String(request.body) }
  }
  const event = Object.assign({ receivedAt: Date.now() }, payload)
  events.push(event)
  server.log.info({ event }, 'ingested event')
  reply.header('Access-Control-Allow-Origin', '*')
  reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  reply.header('Access-Control-Allow-Headers', 'Content-Type')
  return reply.code(204).send()
})

// Simple preflight handler
server.options('/ingest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*')
  reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  reply.header('Access-Control-Allow-Headers', 'Content-Type')
  return reply.code(204).send()
})

// Expose recent events for inspection during tests
server.get('/events', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*')
  return { count: events.length, events: events.slice(-50) }
})

const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' })
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
