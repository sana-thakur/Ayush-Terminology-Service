/**
 * Development-friendly Admin Authentication & Authorization Middleware
 *
 * Protects all /api/admin/* endpoints.
 * Accepts:
 *   1. Authorization: Bearer <token>
 *   2. X-Admin-Token: <token>
 *
 * Configurable via process.env.ADMIN_TOKEN (defaults to 'admin-secret-dev-token-2026')
 */

const DEFAULT_DEV_ADMIN_TOKEN = 'admin-secret-dev-token-2026';

function adminAuthMiddleware(req, res, next) {
  const expectedToken = process.env.ADMIN_TOKEN || DEFAULT_DEV_ADMIN_TOKEN;

  let providedToken = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    providedToken = authHeader.substring(7).trim();
  } else if (req.headers['x-admin-token']) {
    providedToken = String(req.headers['x-admin-token']).trim();
  }

  // 1. Missing authentication credentials
  if (!providedToken) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Admin authentication required. Please provide a valid Bearer token in the Authorization header or X-Admin-Token header.',
      hint: `For development, use default dev token: '${DEFAULT_DEV_ADMIN_TOKEN}' or set ADMIN_TOKEN in env.`
    });
  }

  // 2. Reject non-matching tokens
  if (providedToken !== expectedToken) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied: provided token is invalid or does not have administrator privileges.'
    });
  }

  // 3. Attach authenticated admin context
  req.adminUser = {
    username: 'admin',
    role: 'administrator',
    tokenUsed: providedToken,
    authenticatedAt: new Date().toISOString()
  };

  next();
}

module.exports = adminAuthMiddleware;
