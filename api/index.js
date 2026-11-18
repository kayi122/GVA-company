// Vercel serverless function: every /api/* request is routed here (see vercel.json).
// vercel.json rewrites /api/<path> to /api?__path=<path>, so the original path always arrives
// the same way, whichever way Vercel passes rewritten URLs. We put it back before Express routes it.
import app from '../server/src/app.js';

export default function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const original = url.searchParams.get('__path');
  if (original !== null) {
    url.searchParams.delete('__path');
    const qs = url.searchParams.toString();
    req.url = `/api/${original.replace(/^\/+/, '')}${qs ? `?${qs}` : ''}`;
  }
  return app(req, res);
}
