const http = require('http')

function req(options, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(options, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
    })
    r.on('error', reject)
    if (body) r.write(body)
    r.end()
  })
}

async function main() {
  const base = { hostname: '127.0.0.1', port: 3000 }

  console.log('Fetching current events count...')
  let res = await req(Object.assign({}, base, { path: '/events', method: 'GET' }))
  const before = JSON.parse(res.body || '{"count":0,"events":[]}').count || 0
  console.log('Before count:', before)

  const payload = JSON.stringify({ type: 'click', tag: 'BUTTON', x: 10, y: 20, ts: Date.now() })
  res = await req(Object.assign({}, base, { path: '/ingest', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }), payload)
  console.log('Ingest response status:', res.statusCode)

  // Give server a small moment
  await new Promise((r) => setTimeout(r, 200))

  res = await req(Object.assign({}, base, { path: '/events', method: 'GET' }))
  const after = JSON.parse(res.body || '{"count":0,"events":[]}').count || 0
  console.log('After count:', after)

  if (after > before) {
    console.log('Integration test PASSED')
    process.exit(0)
  } else {
    console.error('Integration test FAILED')
    process.exit(2)
  }
}

main().catch((err) => { console.error(err); process.exit(3) })
