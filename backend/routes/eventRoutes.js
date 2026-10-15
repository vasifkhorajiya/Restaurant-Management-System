import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { addClient, consumeTicket, createTicket } from '../utils/realtime.js';

const router = express.Router();

// step 1 — normal authenticated request, returns a one-time ticket
router.post('/ticket', verifyToken, (req, res) => {
  res.json({ ticket: createTicket(req.user) });
});

// step 2 — the stream itself (EventSource), authorised by the ticket
router.get('/stream', (req, res) => {
  const user = consumeTicket(String(req.query.ticket || ''));
  if (!user) return res.status(401).json({ message: 'Invalid or expired ticket' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // tell nginx not to buffer the stream
  });
  res.write('retry: 3000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ role: user.role })}\n\n`);

  const remove = addClient(res, user);
  req.on('close', remove);
});

export default router;
