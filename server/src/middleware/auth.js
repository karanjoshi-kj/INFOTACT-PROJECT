const jwt = require("jsonwebtoken");

// Protects routes: requires "Authorization: Bearer <token>" (the JWT made at login).
// On success it puts the logged-in user's id on req.userId.
function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : req.query && req.query.token
    ? req.query.token
    : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Please log in first" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Session expired. Please log in again" });
  }
}

module.exports = requireAuth;