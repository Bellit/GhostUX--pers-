const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = process.env.PORT || 8000
const ROOT = path.join(__dirname)

function contentType(file) {
  const ext = path.extname(file).toLowerCase()
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8'
    case '.js': return 'application/javascript; charset=utf-8'
    case '.css': return 'text/css; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.png': return 'image/png'
    case '.jpg': case '.jpeg': return 'image/jpeg'
    case '.svg': return 'image/svg+xml'
    default: return 'application/octet-stream'
  }
}

const server = http.createServer((req, res) => {
  try {
    let reqPath = decodeURIComponent(req.url.split('?')[0])
    if (reqPath === '/' || reqPath === '') reqPath = '/test.html'
    const filePath = path.join(ROOT, reqPath)
    if (!filePath.startsWith(ROOT)) return res.writeHead(403).end('Forbidden')
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end('Not found')
      }
      res.writeHead(200, { 'Content-Type': contentType(filePath) })
      const stream = fs.createReadStream(filePath)
      stream.pipe(res)
      stream.on('error', () => res.end())
    })
  } catch (e) {
    res.writeHead(500)
    res.end('Server error')
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('static server serving', ROOT, 'on http://localhost:' + PORT)
})
