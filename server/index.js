import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ask, parseRequest, toHttpError } from './chat-core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.post('/api/chat', async (req, res) => {
  try {
    const answer = await ask(parseRequest(req.body));
    res.json({ answer });
  } catch (err) {
    const { status, message } = toHttpError(err);
    if (status >= 500) console.error('[chat]', err);
    res.status(status === 200 ? 200 : status).json(status === 200 ? { answer: message } : { error: message });
  }
});

// Hashed assets are immutable; index.html must never be cached or a deploy
// would keep serving the previous bundle.
app.use(
  express.static(dist, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

// SPA fallback — every non-API route renders the client router.
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(dist, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Engosoft dashboard listening on :${port}`);
});
