import crypto from 'crypto';

// =====================================================================
//  REAL-TIME HUB  (Server-Sent Events — built into browsers, no extra package)
//
//  • The browser first asks for a one-time "ticket" with its normal login token
//    (EventSource cannot send an Authorization header), then opens the stream with it.
//  • Tickets live 30 s, work once, and are bound to the user — the token never appears in a URL.
//  • Every event is addressed to ONE user, or to ONE restaurant's managers (+ all admins).
//  • State lives in memory, so this suits a single server process. For several servers
//    put Redis pub/sub behind publish() — nothing else in the app has to change.
// =====================================================================
const clients = new Set();          // { res, userId, role, restaurantId }
const tickets = new Map();          // ticket -> { user, expires }
const MAX_STREAMS_PER_USER = 5;     // a few tabs/devices are fine, a runaway client is not

export function createTicket(user) {
  const ticket = crypto.randomBytes(24).toString('hex');
  tickets.set(ticket, { user, expires: Date.now() + 30_000 });
  return ticket;
}

export function consumeTicket(ticket) {
  const t = tickets.get(ticket);
  tickets.delete(ticket); // single use
  return t && t.expires > Date.now() ? t.user : null;
}

export function addClient(res, user) {
  const mine = [...clients].filter((c) => c.userId === user.id);
  if (mine.length >= MAX_STREAMS_PER_USER) {
    mine[0].res.end(); // drop the oldest
    clients.delete(mine[0]);
  }
  const client = { res, userId: user.id, role: user.role, restaurantId: user.restaurant_id };
  clients.add(client);
  return () => clients.delete(client);
}

function send(client, event, data) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
  } catch {
    clients.delete(client);
  }
}

export function toUser(userId, event, data) {
  clients.forEach((c) => { if (c.userId === userId) send(c, event, data); });
}

// managers of that restaurant + every admin
export function toRestaurant(restaurantId, event, data) {
  clients.forEach((c) => {
    if (c.role === 'admin' || (c.role === 'manager' && c.restaurantId === restaurantId)) send(c, event, data);
  });
}

export const liveClientCount = () => clients.size;

// comment line every 25 s keeps proxies/load-balancers from closing an idle stream
setInterval(() => {
  clients.forEach((c) => { try { c.res.write(': ping\n\n'); } catch { clients.delete(c); } });
  const now = Date.now();
  tickets.forEach((t, k) => { if (t.expires < now) tickets.delete(k); });
}, 25_000).unref();
