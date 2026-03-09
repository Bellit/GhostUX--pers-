const puppeteer = require('puppeteer');
const fetch = global.fetch || require('node-fetch');

(async () => {
  const STATIC_URL = process.env.STATIC_URL || 'http://127.0.0.1:8001/test.html'
  const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:3000'
  console.log('Starting puppeteer')
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(20000)
  page.on('console', msg => {
    try { console.log('PAGE LOG:', msg.text()) } catch (e) {}
  })
  // disable sendBeacon so we force fetch + IndexedDB path in tests
  await page.evaluateOnNewDocument(() => {
    try { Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true }) } catch (e) {}
  })

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
  async function waitForService(url, timeoutMs = 10000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(url, { method: 'HEAD' })
        if (res && (res.status === 200 || res.status === 204)) return true
      } catch (e) {}
      await sleep(500)
    }
    return false
  }

  console.log('Waiting for static page and backend to be ready')
  const okStatic = await waitForService(STATIC_URL.replace(/\/test.html$/, ''))
  const okBackend = await waitForService(BACKEND + '/events')
  if (!okStatic) console.warn('Static server not responding yet')
  if (!okBackend) console.warn('Backend not responding yet')

  console.log('Opening', STATIC_URL)
  await page.goto(STATIC_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(500)

  // ensure snippet loaded (retry a few times)
  let hasSnippet = false
  for (let i = 0; i < 6; i++) {
    hasSnippet = await page.evaluate(() => !!(window && window._ghostux))
    if (hasSnippet) break
    await sleep(500)
  }
  console.log('snippet present:', hasSnippet)

  // Activate backend failure
  console.log('Activating backend failure')
  await fetch(BACKEND + '/toggle-fail', { method: 'POST', body: JSON.stringify({ fail: true }), headers: { 'Content-Type': 'application/json' } })

  // generate clicks
  console.log('Generating clicks (should be enqueued)')
  for (let i = 0; i < 8; i++) {
    await page.mouse.click(100 + i*2, 100 + i*2)
    await sleep(150)
  }

  // wait for queued events to persist (poll IndexedDB up to 10s)
  const startPersist = Date.now()
  let stored = null
  while (Date.now() - startPersist < 10000) {
    stored = await page.evaluate(() => {
      return new Promise((res) => {
        try {
          const r = indexedDB.open('ghostux-db')
          r.onsuccess = () => {
            const db = r.result
            if (!db.objectStoreNames.contains('kv')) return res(null)
            const tx = db.transaction('kv', 'readonly')
            const st = tx.objectStore('kv')
            const rq = st.get('ghostux_queue_v1')
            rq.onsuccess = () => res(rq.result)
            rq.onerror = () => res(null)
          }
          r.onerror = () => res(null)
        } catch (e) { res(null) }
      })
    })
    if (Array.isArray(stored) && stored.length > 0) break
    await sleep(500)
  }

  // 'stored' already obtained by polling above; reuse that value

  console.log('IndexedDB queue length:', Array.isArray(stored) ? stored.length : stored)
  console.log('IndexedDB stored contents (sample):', Array.isArray(stored) ? stored.slice(0,10) : stored)
  if (!Array.isArray(stored) || stored.length === 0) {
    console.error('ERROR: no events persisted in IndexedDB queue')
  }

  // Deactivate failure
  console.log('Deactivating backend failure')
  await fetch(BACKEND + '/toggle-fail', { method: 'POST', body: JSON.stringify({ fail: false }), headers: { 'Content-Type': 'application/json' } })

  // trigger flush from page and wait for backend to receive events
  await page.evaluate(() => { try { window._ghostux && window._ghostux.flush && window._ghostux.flush() } catch (e) {} })
  const startSend = Date.now()
  let evJson = null
  while (Date.now() - startSend < 10000) {
    try {
      const evRes = await fetch(BACKEND + '/events')
      evJson = await evRes.json()
      if (evJson && evJson.count && evJson.count > 0) break
    } catch (e) {}
    await sleep(500)
  }
  console.log('backend events count (last 50):', evJson && evJson.count)

  await browser.close()
  console.log('Test finished')
  process.exit(0)
})().catch(err => { console.error(err); process.exit(2) })
