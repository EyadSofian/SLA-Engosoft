import { ask, parseRequest, toHttpError } from '../server/chat-core.js';

/** Vercel serverless entry point — same logic as the Express route. */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST بس.' });
  }

  try {
    const answer = await ask(parseRequest(req.body));
    return res.status(200).json({ answer });
  } catch (err) {
    const { status, message } = toHttpError(err);
    if (status >= 500) console.error('[chat]', err);
    return status === 200
      ? res.status(200).json({ answer: message })
      : res.status(status).json({ error: message });
  }
}
