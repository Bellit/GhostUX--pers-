const puppeteer = require('puppeteer');
const fetch = global.fetch || require('node-fetch');

(async () => {
  const STATIC_URL = process.env.STATIC_URL || 'http://localhost:8001/test.html'
  const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000'
  console.log('Starting puppeteer')
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(20000)

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

  console.log('Opening', STATIC_URL)
  await page.goto(STATIC_URL)
  await sleep(500)

  // ensure snippet loaded
  const hasSnippet = await page.evaluate(() => !!(window && window._ghostux))
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

  // wait for snippet to persist
  await sleep(1500)

  // read IndexedDB value
  const stored = await page.evaluate(() => {
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

  console.log('IndexedDB queue length:', Array.isArray(stored) ? stored.length : stored)
  console.log('IndexedDB stored contents (sample):', Array.isArray(stored) ? stored.slice(0,10) : stored)
  if (!Array.isArray(stored) || stored.length === 0) {
    console.error('ERROR: no events persisted in IndexedDB queue')
  }

  // Deactivate failure
  console.log('Deactivating backend failure')
  await fetch(BACKEND + '/toggle-fail', { method: 'POST', body: JSON.stringify({ fail: false }), headers: { 'Content-Type': 'application/json' } })

  // trigger flush from page
  await page.evaluate(() => {
    try { window._ghostux && window._ghostux.flush && window._ghostux.flush() } catch (e) {}
  })

  // wait for send + backend to register
  await sleep(2000)

  // query backend events count
  const evRes = await fetch(BACKEND + '/events')
  const evJson = await evRes.json()
  console.log('backend events count (last 50):', evJson.count)

  await browser.close()
  console.log('Test finished')
  process.exit(0)
})().catch(err => { console.error(err); process.exit(2) })
