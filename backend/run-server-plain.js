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
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-admin-token'
const USE_SQLITE = process.env.USE_SQLITE === '1'
const SQLITE_DB = path.join(DATA_DIR, 'events.sqlite')
var sqliteEnabled = false
var sqliteDb = null

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

// Try to initialize sqlite if requested
if (USE_SQLITE) {
  try {
    const sqlite3 = require('sqlite3').verbose()
    sqliteDb = new sqlite3.Database(SQLITE_DB)
    sqliteDb.serialize(() => {
      sqliteDb.run('CREATE TABLE IF NOT EXISTS events (receivedAt INTEGER, eventId TEXT PRIMARY KEY, payload TEXT)')
      // load events from sqlite into memory
      sqliteDb.all('SELECT receivedAt,eventId,payload FROM events ORDER BY receivedAt ASC', (err, rows) => {
        if (!err && rows && rows.length) {
          rows.forEach((r) => {
            try {
              const ev = JSON.parse(r.payload)
              events.push(ev)
              if (ev && ev.eventId) seenIds.add(ev.eventId)
            } catch (e) { /* ignore */ }
          })
        }
      })
    })
    sqliteEnabled = true
    console.log('SQLite persistence enabled:', SQLITE_DB)
  } catch (e) {
    console.warn('SQLite requested but not available, falling back to JSONL:', e && e.message)
    sqliteEnabled = false
  }
}

// Helper: save full events array back to JSONL (atomic write)
function saveEventsToLog(arr) {
  try {
    if (sqliteEnabled && sqliteDb) {
      // replace table contents atomically via transaction
      sqliteDb.serialize(() => {
        sqliteDb.run('BEGIN TRANSACTION')
        sqliteDb.run('DELETE FROM events')
        const stmt = sqliteDb.prepare('INSERT OR IGNORE INTO events (receivedAt,eventId,payload) VALUES (?,?,?)')
        for (const e of arr) {
          stmt.run(e.receivedAt || Date.now(), e.eventId || '', JSON.stringify(e))
        }
        stmt.finalize()
        sqliteDb.run('COMMIT')
      })
      return true
    }
    const tmp = EVENTS_LOG + '.tmp'
    const out = arr.map((e) => JSON.stringify(e)).join('\n') + (arr.length ? '\n' : '')
    fs.writeFileSync(tmp, out, 'utf8')
    fs.renameSync(tmp, EVENTS_LOG)
    return true
  } catch (err) {
    console.error('Failed to save events log', err)
    return false
  }
}

// Helper: cleanup events older than `days` and persist
function cleanupOldEvents(days) {
  const cutoff = Date.now() - (Number(days) || 0) * 24 * 60 * 60 * 1000
  const before = events.length
  if (sqliteEnabled && sqliteDb) {
    try {
      sqliteDb.run('DELETE FROM events WHERE receivedAt < ?', cutoff)
      // reload memory from sqlite
      events = []
      seenIds = new Set()
      sqliteDb.all('SELECT payload FROM events ORDER BY receivedAt ASC', (err, rows) => {
        if (!err && rows) rows.forEach(r => {
          try { const ev = JSON.parse(r.payload); events.push(ev); if (ev && ev.eventId) seenIds.add(ev.eventId) } catch (e) {}
        })
      })
      return { ok: true, before: before, after: events.length }
    } catch (e) { return { ok: false, before: before, after: before } }
  }
  events = events.filter((e) => !e.receivedAt || e.receivedAt >= cutoff)
  // rebuild seenIds set
  seenIds = new Set(events.map((e) => e.eventId).filter(Boolean))
  const ok = saveEventsToLog(events)
  return { ok: ok, before: before, after: events.length }
}

function isAdminAuthorized(req, query) {
  // check header or query param
  const token = (req.headers['x-admin-token'] || '').toString() || (query && query.token)
  return token === ADMIN_TOKEN
}

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
      try {
        if (sqliteEnabled && sqliteDb) {
          try {
            const stmt = sqliteDb.prepare('INSERT OR IGNORE INTO events (receivedAt,eventId,payload) VALUES (?,?,?)')
            stmt.run(ev.receivedAt || Date.now(), ev.eventId || '', JSON.stringify(ev))
            stmt.finalize()
          } catch (e) {
            console.error('SQLite append failed, falling back to file', e && e.message)
            fs.appendFileSync(EVENTS_LOG, JSON.stringify(ev) + '\n')
          }
        } else {
          fs.appendFileSync(EVENTS_LOG, JSON.stringify(ev) + '\n')
        }
      } catch (e) { console.error('Failed to append event', e) }
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
  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>GhostUX Dashboard</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;margin:20px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px}</style>
    </head>
    <body>
      <h1>GhostUX Dashboard</h1>
      <div style="margin-bottom:12px">
        <label>Admin token: <input id="token" style="width:320px" placeholder="x-admin-token"></label>
        <button id="saveToken">Guardar</button> <button id="clearToken">Borrar</button>
      </div>
      <div style="margin-bottom:12px">
        <button id="refresh">Refrescar eventos</button>
        <button id="export">Exportar JSON</button>
        Cleanup (días): <input id="days" value="30" style="width:60px"> <button id="cleanup">Run</button>
      </div>
      <div id="status" style="margin-bottom:12px;color:#333"></div>
      <div id="tableWrap"></div>
      <script>
        (function(){
          var tokenInput=document.getElementById("token");
          var saved=localStorage.getItem("ghostux_admin_token"); if(saved) tokenInput.value=saved;
          document.getElementById("saveToken").onclick=function(){ localStorage.setItem("ghostux_admin_token", tokenInput.value); alert("Token guardado en localStorage"); };
          document.getElementById("clearToken").onclick=function(){ localStorage.removeItem("ghostux_admin_token"); tokenInput.value=""; alert("Token borrado"); };
          function setStatus(s){ document.getElementById("status").textContent = s; }
          function renderTable(rows){ var wrap=document.getElementById("tableWrap"); if(!rows || !rows.length){ wrap.innerHTML = "<p>No hay eventos</p>"; return; } var out = '<table><tr><th>receivedAt</th><th>eventId</th><th>type</th><th>pageUrl</th></tr>'; for(var i=rows.length-1;i>=0;i--){ var ev=rows[i]; out += '<tr><td>' + (new Date(ev.receivedAt)).toISOString() + '</td><td>' + (ev.eventId||'') + '</td><td>' + (ev.type||'') + '</td><td>' + ((ev.pageUrl||'').replace(/</g,'&lt;')) + '</td></tr>'; } out += '</table>'; wrap.innerHTML = out; }
          function loadEvents(){ setStatus('Cargando...'); fetch('/events').then(function(r){ return r.json(); }).then(function(j){ renderTable(j.events||[]); setStatus('Eventos: ' + (j.count||0)); }).catch(function(e){ setStatus('Error cargando eventos'); }); }
          document.getElementById('refresh').onclick = loadEvents; loadEvents();
          document.getElementById('export').onclick = function(){ var token = localStorage.getItem('ghostux_admin_token') || document.getElementById('token').value; var headers = {}; if(token) headers['x-admin-token'] = token; fetch('/admin/export?limit=10000', { headers: headers }).then(function(r){ if(r.status === 401){ alert('Unauthorized: token inválido'); return; } return r.text(); }).then(function(txt){ if(!txt) return; var blob = new Blob([txt], { type: 'application/json' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'events.json'; a.click(); URL.revokeObjectURL(url); }).catch(function(e){ alert('Error export: ' + e.message); }); };
          document.getElementById('cleanup').onclick = function(){ var days = document.getElementById('days').value; if(!confirm('Confirm cleanup older than ' + days + ' days?')) return; var token = localStorage.getItem('ghostux_admin_token') || document.getElementById('token').value; var headers = {'Content-Type':'application/json'}; if(token) headers['x-admin-token'] = token; fetch('/admin/cleanup', { method: 'POST', headers: headers, body: JSON.stringify({ days: Number(days) }) }).then(function(r){ return r.json().then(function(j){ if(r.status === 401){ alert('Unauthorized: token inválido'); return; } setStatus('Cleanup result: ' + JSON.stringify(j)); loadEvents(); }); }).catch(function(e){ alert('Error cleanup: ' + e.message); }); };
        })();
      </script>
    </body>
  </html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function handleAdminExport(req, res) {
  // export last N events as JSON (default 1000)
  const q = url.parse(req.url, true).query
  if (!isAdminAuthorized(req, q)) return sendJSON(res, 401, { error: 'unauthorized' })
  const limit = Math.min(Number(q.limit) || 1000, 10000)
  const out = events.slice(-limit)
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Disposition': 'attachment; filename="events.json"',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(JSON.stringify({ count: out.length, events: out }, null, 2))
}

function handleAdminLogin(req, res) {
  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>Admin Login - GhostUX</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;margin:20px}</style>
    </head>
    <body>
      <h1>Admin Login</h1>
      <p>Introduce tu token admin (dev: dev-admin-token)</p>
      <label>Token: <input id="token" style="width:360px"/></label>
      <button id="save">Guardar y entrar</button>
      <script>
        (function(){
          var t=document.getElementById('token');
          var s=localStorage.getItem('ghostux_admin_token'); if(s) t.value=s;
          document.getElementById('save').onclick=function(){ localStorage.setItem('ghostux_admin_token', t.value); window.location.href='/dashboard'; };
        })();
      </script>
    </body>
  </html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function handleAdminCleanup(req, res) {
  var body = ''
  req.on('data', function (chunk) { body += chunk })
  req.on('end', function () {
    try {
      var obj = JSON.parse(body || '{}')
      var q = url.parse(req.url, true).query
      if (!isAdminAuthorized(req, q)) return sendJSON(res, 401, { error: 'unauthorized' })
      var days = obj.days || obj.maxAgeDays || 30
      var result = cleanupOldEvents(days)
      return sendJSON(res, 200, { ok: result.ok, before: result.before, after: result.after })
    } catch (e) {
      return sendJSON(res, 400, { error: 'invalid body, expected {"days":number}' })
    }
  })
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
  if (p.pathname === '/admin/export' && req.method === 'GET') return handleAdminExport(req, res)
  if (p.pathname === '/admin/cleanup' && req.method === 'POST') return handleAdminCleanup(req, res)
  if (p.pathname === '/admin/login' && req.method === 'GET') return handleAdminLogin(req, res)
  if (p.pathname === '/dashboard' && req.method === 'GET') return handleDashboard(req, res)
  if (p.pathname === '/' && req.method === 'GET') return sendJSON(res, 200, { status: 'ok', service: 'ghostux-backend-plain' })

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

var port = process.env.PORT || 3000
server.listen(port, '0.0.0.0', function () {
  console.log('server listening on port', port)
})
