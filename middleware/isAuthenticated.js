// middleware/isAuthenticated.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ── Session-based guard (for EJS page routes) ─────────────────
// Redirects to login with flash message if not authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();

  // Store intended destination for post-login redirect
  if (req.session) {
    req.session.returnTo = req.originalUrl;
  }

  req.flash('error', 'Please sign in first to access that page.');
  res.redirect('/auth/login');
};

// ── JWT-based guard (for API routes) ─────────────────────────
const verifyJWT = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided. Please authenticate.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) {
      return res.status(401).json({ error: 'User not found.' });
    }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

// ── Pro-only guard ────────────────────────────────────────────
const isPro = (req, res, next) => {
  if (!req.isAuthenticated()) {
    req.flash('error', 'Please sign in first.');
    return res.redirect('/auth/login');
  }
  if (req.user.subscription_status === 'Free') {
    req.flash('error', 'This feature requires a Pro or Lifetime plan.');
    return res.redirect('/dashboard');
  }
  next();
};

module.exports = { isAuthenticated, verifyJWT, isPro };
