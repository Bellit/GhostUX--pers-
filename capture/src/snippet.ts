// Snippet minimal: captura de clics y envío por fetch (ejemplo)
(function () {
  function collectEvent(e) {
    const payload = {
      type: e.type,
      tag: e.target && e.target.tagName,
      x: e.clientX || null,
      y: e.clientY || null,
      ts: Date.now()
    }
    // Envío asíncrono (no bloquear)
    navigator.sendBeacon && navigator.sendBeacon('/ingest', JSON.stringify(payload)) ||
      fetch('/ingest', { method: 'POST', body: JSON.stringify(payload), keepalive: true })
  }

  document.addEventListener('click', collectEvent, true)
  window.addEventListener('error', collectEvent, true)
  window.addEventListener('beforeunload', () => {
    // posible flush
  })
})()
