// Wraps an async route handler so any rejected promise (a failed query,
// a thrown error, anything) gets forwarded to Express's error middleware
// instead of hanging the request forever with no response.
//
// Without this, a controller like:
//   export async function getUsers(req, res) {
//     const [rows] = await pool.query(...);   // <- if this throws...
//     res.json(rows);
//   }
// ...never sends a response on failure, because Express 4 doesn't catch
// rejected promises on its own. Wrapping every route with this fixes that
// across the whole app in one place, instead of hand-adding try/catch to
// every single controller function.
export default function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
