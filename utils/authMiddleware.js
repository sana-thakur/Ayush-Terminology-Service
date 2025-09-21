// Mock middleware to simulate ABHA token verification and consent check
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization header with Bearer token is required.'
    });
  }

  const token = authHeader.split(' ')[1];

  // In a real system, you would:
  // 1. Validate the JWT token signature.
  // 2. Check the token's claims (issuer, expiry, etc.).
  // 3. Verify the ABHA ID against a session or consent artifact.
  // For this prototype, any Bearer token is accepted.

  console.log(`[Auth Middleware] Access granted for token (ABHA ID): ${token}`);

  // Add metadata to the request for the controller to use
  req.user = { abhaId: token };

  next(); // Proceed to the next middleware/controller
}

module.exports = authMiddleware;
