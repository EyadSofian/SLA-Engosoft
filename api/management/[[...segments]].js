import { handleManagement } from '../../server/management-core.js';

/**
 * Vercel serverless entry point for /api/management/* — same handler the
 * Express server mounts. The catch-all filename gives us the path segments in
 * `req.query.segments`, so `/api/management/items/<id>` arrives as
 * `['items', '<id>']`.
 */
export default async function handler(req, res) {
  const raw = req.query?.segments ?? [];
  const segments = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);

  // Everything else in req.query is a real query-string parameter.
  const { segments: _path, ...query } = req.query ?? {};

  const { status, body } = await handleManagement({
    method: req.method,
    segments,
    query,
    body: req.body ?? {},
    headers: req.headers,
    ip: String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || '',
  });

  return res.status(status).json(body);
}
