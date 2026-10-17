// Dealers Choice dev/prod server: zero dependencies, serves ./public.
//   node server.mjs            (PORT defaults to 4449)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('./public', import.meta.url)));
const PORT = Number(process.env.PORT) || 4449;
const HOST = process.env.HOST || '0.0.0.0';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  const full = resolve(join(ROOT, normalize(p)));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null; // no path traversal
  try {
    const st = await stat(full);
    if (st.isDirectory()) return resolveFile(join(p, 'index.html'));
    return full;
  } catch { return null; }
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); return; }
  const file = await resolveFile(req.url);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>Not found</title><body style="font-family:sans-serif;background:#0E241D;color:#F4EFE3;padding:40px"><h1>Misdeal: page not found</h1><p><a style="color:#E2C27A" href="/">Back to the lobby</a></p>');
    return;
  }
  const body = await readFile(file);
  const headers = {
    'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
  };
  // Byte ranges let audio seek (music resumes mid-song after moving to another page).
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, body.length - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), body.length - 1) : body.length - 1;
    if (start >= body.length || start > end) {
      res.writeHead(416, { 'content-range': `bytes */${body.length}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': end - start + 1 });
    res.end(req.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
});

server.listen(PORT, HOST, () => console.log(`Dealers Choice running at http://localhost:${PORT}`));
