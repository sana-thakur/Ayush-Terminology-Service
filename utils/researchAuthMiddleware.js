/**
 * Development-friendly Researcher Authentication & Authorization Middleware
 *
 * Protects /api/research/* endpoints.
 * Accepts:
 *   1. Authorization: Bearer <token>
 *   2. X-Researcher-Token: <token>
 *   3. X-Admin-Token: <token>
 *   4. Query parameter ?token=<token> (essential for browser export downloads)
 *
 * Defaults:
 *   'researcher-secret-dev-token-2026' or 'admin-secret-dev-token-2026'
 */

const DEFAULT_DEV_RESEARCHER_TOKEN = 'researcher-secret-dev-token-2026';
const DEFAULT_DEV_ADMIN_TOKEN = 'admin-secret-dev-token-2026';

function researchAuthMiddleware(req, res, next) {
  const allowedTokens = [
    process.env.RESEARCHER_TOKEN || DEFAULT_DEV_RESEARCHER_TOKEN,
    process.env.ADMIN_TOKEN || DEFAULT_DEV_ADMIN_TOKEN,
    DEFAULT_DEV_RESEARCHER_TOKEN,
    DEFAULT_DEV_ADMIN_TOKEN
  ].filter(Boolean);

  let providedToken = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    providedToken = authHeader.substring(7).trim();
  } else if (req.headers['x-researcher-token']) {
    providedToken = String(req.headers['x-researcher-token']).trim();
  } else if (req.headers['x-admin-token']) {
    providedToken = String(req.headers['x-admin-token']).trim();
  } else if (req.query && req.query.token) {
    providedToken = String(req.query.token).trim();
  }

  // 1. Missing authentication credentials
  if (!providedToken) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Researcher authentication required. Please provide a valid Bearer token in the Authorization header, X-Researcher-Token header, or ?token query parameter.',
      hint: `For development, use default token: '${DEFAULT_DEV_RESEARCHER_TOKEN}'`
    });
  }

  // 2. Reject non-matching tokens
  if (!allowedTokens.includes(providedToken)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied: provided token is invalid or does not have researcher privileges.'
    });
  }

  req.researcher = {
    token: providedToken,
    role: 'researcher',
    authenticatedAt: new Date().toISOString()
  };

  next();
}

module.exports = researchAuthMiddleware;
