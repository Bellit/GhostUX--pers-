// Snippet minimal: captura de clics y envío por fetch (ejemplo)
;(function () {
  // Batching capture snippet
  const INGEST_URL = (window as any).__GHOSTUX_INGEST_URL__ || 'http://127.0.0.1:3000/ingest'
  const BATCH_SIZE = 25
  const FLUSH_INTERVAL = 2000
  const MAX_QUEUE = 1000
  const QUEUE_STORAGE_KEY = 'ghostux_queue_v1'
  const MAX_RETRIES = 4
  const RETRY_BASE = 500 // ms
  const RETRY_FACTOR = 2
  const RETRY_JITTER = 0.2
  const IDB_DB_NAME = 'ghostux-db'
  const IDB_STORE = 'kv'

  function genId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
  }

  // lightweight session/anon ids
  function getOrCreate(key: string) {
    try {
      const v = localStorage.getItem(key)
      if (v) return v
      const id = genId()
      localStorage.setItem(key, id)
      return id
    } catch (e) {
      return genId()
    }
  }

  const sessionId = getOrCreate('ghostux_session')
  const anonId = getOrCreate('ghostux_anon')

  let queue: any[] = []
  let flushTimer: number | null = null

  function enqueue(ev: any) {
    if (queue.length >= MAX_QUEUE) queue.shift()
    queue.push(ev)
    persistQueue()
    try { console.log('[ghostux] enqueue id=', ev.eventId, 'queueLen=', queue.length) } catch (e) {}
    if (queue.length >= BATCH_SIZE) flush()
    scheduleFlush()
  }

  // IndexedDB helpers (small key/value store)
  function openIdb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('no idb'))
      const r = indexedDB.open(IDB_DB_NAME, 1)
      r.onupgradeneeded = function () {
        const db = r.result
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
      }
      r.onsuccess = function () { resolve(r.result) }
      r.onerror = function () { reject(r.error) }
    })
  }

  function idbGet(key) {
    return openIdb().then((db) => new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const st = tx.objectStore(IDB_STORE)
      const rq = st.get(key)
      rq.onsuccess = () => { res(rq.result) }
      rq.onerror = () => rej(rq.error)
    })).catch(() => null)
  }

  function idbSet(key, value) {
    return openIdb().then((db) => new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const st = tx.objectStore(IDB_STORE)
      const rq = st.put(value, key)
      rq.onsuccess = () => { res(true) }
      rq.onerror = () => rej(rq.error)
    })).catch(() => false)
  }

  function idbDelete(key) {
    return openIdb().then((db) => new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const st = tx.objectStore(IDB_STORE)
      const rq = st.delete(key)
      rq.onsuccess = () => { res(true) }
      rq.onerror = () => rej(rq.error)
    })).catch(() => false)
  }

  async function persistQueue() {
    try {
      // try IDB first
      const ok = await idbSet(QUEUE_STORAGE_KEY, queue)
      console.log('[ghostux] persistQueue -> idb ok=', !!ok, 'len=', queue.length)
      if (ok) return
    } catch (e) { console.log('[ghostux] persistQueue idb error', e) }
    try { localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue)); console.log('[ghostux] persistQueue -> localStorage len=', queue.length) } catch (e) { console.log('[ghostux] persistQueue localStorage error', e) }
  }

  async function loadQueue() {
    try {
      const v = await idbGet(QUEUE_STORAGE_KEY)
      if (Array.isArray(v) && v.length) { queue = v.concat(queue); console.log('[ghostux] loadQueue -> idb len=', v.length) }
      else {
        const s = localStorage.getItem(QUEUE_STORAGE_KEY)
        if (s) {
          const parsed = JSON.parse(s)
          if (Array.isArray(parsed)) { queue = parsed.concat(queue); console.log('[ghostux] loadQueue -> localStorage len=', parsed.length) }
        }
      }
    } catch (e) {
      console.log('[ghostux] loadQueue error', e)
      try {
        const s = localStorage.getItem(QUEUE_STORAGE_KEY)
        if (s) {
          const parsed = JSON.parse(s)
          if (Array.isArray(parsed)) { queue = parsed.concat(queue); console.log('[ghostux] loadQueue -> fallback localStorage len=', parsed.length) }
        }
      } catch (err) { console.log('[ghostux] loadQueue fallback error', err) }
    }
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = window.setTimeout(() => { flushTimer = null; flush() }, FLUSH_INTERVAL)
  }

  function clearQueue(n: number) {
    queue.splice(0, n)
    persistQueue()
  }

  function clearQueueByIds(ids: string[]) {
    queue = queue.filter((it) => !ids.includes(it.eventId))
    persistQueue()
  }

  async function sendBatchWithRetry(batch: any[], attempt = 0) {
    const ids = batch.map((b) => b.eventId)
    const body = JSON.stringify(batch)
    try {
      try { console.log('[ghostux] sendBatch attempt=', attempt, 'batchLen=', batch.length, 'ids=', ids.slice(0,5)) } catch (e) {}
      if (navigator.sendBeacon && attempt === 0) {
        try {
          navigator.sendBeacon(INGEST_URL, body)
          clearQueueByIds(ids)
          return
        } catch (e) {
          // fallthrough to fetch
        }
      }
      const res = await fetch(INGEST_URL, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true })
      try { console.log('[ghostux] sendBatch response status=', res && res.status) } catch (e) {}
      if (res && (res.status === 200 || res.status === 204)) {
        clearQueueByIds(ids)
        return
      }
      // for 4xx (except 429) do not retry
      if (res && res.status >= 400 && res.status < 500 && res.status !== 429) return
    } catch (err) {
      // network error: will retry below if attempts remain
    }

    if (attempt < MAX_RETRIES) {
      const base = RETRY_BASE * Math.pow(RETRY_FACTOR, attempt)
      const jitter = Math.round(base * RETRY_JITTER * (Math.random() * 2 - 1))
      const delay = Math.max(100, Math.round(base + jitter))
      setTimeout(() => sendBatchWithRetry(batch, attempt + 1), delay)
    }
  }

  async function flush() {
    if (!queue.length) return
    const batch = queue.slice(0, BATCH_SIZE)
    // optimistic: schedule retry/send but don't remove until success
    sendBatchWithRetry(batch, 0)
  }

  function collectEvent(e: any) {
    const payload = {
      eventId: genId(),
      type: e.type,
      ts: Date.now(),
      pageUrl: location.href,
      referrer: document.referrer || null,
      tag: e.target && e.target.tagName ? e.target.tagName : null,
      selector: (e.target && (e.target.getAttribute && e.target.getAttribute('data-gtx')) ) || null,
      x: e.clientX == null ? null : e.clientX,
      y: e.clientY == null ? null : e.clientY,
      viewport: { width: innerWidth, height: innerHeight },
      userAgent: (navigator && navigator.userAgent) ? String(navigator.userAgent).slice(0, 200) : null,
      sessionId,
      anonId,
      meta: {}
    }
    enqueue(payload)
  }

  document.addEventListener('click', collectEvent, true)
  window.addEventListener('error', collectEvent, true)
  // cargar cola persistida en background
  loadQueue()
  window.addEventListener('beforeunload', () => {
    // try to flush synchronously
    if (queue.length) {
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(INGEST_URL, JSON.stringify(queue))
          queue = []
          persistQueue()
        }
      } catch (e) {}
    }
  })

  // expose for debugging
  (window as any)._ghostux = { enqueue, flush }
})()
