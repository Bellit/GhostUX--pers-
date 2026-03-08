// Simple migration: read backend/data/events.log and insert into sqlite DB
const fs = require('fs')
const path = require('path')
const DATA_DIR = path.join(__dirname, 'data')
const EVENTS_LOG = path.join(DATA_DIR, 'events.log')
const SQLITE_DB = path.join(DATA_DIR, 'events.sqlite')

async function run() {
  if (!fs.existsSync(EVENTS_LOG)) {
    console.error('No events.log found at', EVENTS_LOG)
    process.exit(1)
  }
  let rows = fs.readFileSync(EVENTS_LOG, 'utf8').split('\n').filter(Boolean)
  const sqlite3 = require('sqlite3').verbose()
  const db = new sqlite3.Database(SQLITE_DB)
  db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS events (receivedAt INTEGER, eventId TEXT PRIMARY KEY, payload TEXT)')
    const stmt = db.prepare('INSERT OR IGNORE INTO events (receivedAt,eventId,payload) VALUES (?,?,?)')
    for (const line of rows) {
      try {
        const ev = JSON.parse(line)
        stmt.run(ev.receivedAt || Date.now(), ev.eventId || '', JSON.stringify(ev))
      } catch (e) { /* skip */ }
    }
    stmt.finalize()
    console.log('Migration complete, inserted', rows.length, 'rows (duplicates ignored)')
    db.close()
  })
}

run().catch((e)=>{console.error(e); process.exit(2)})
