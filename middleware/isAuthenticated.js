// middleware/isAuthenticated.js (hardened)
//
// Changes:
//   [SEC] verifyJWT now applies plan expiry (req.user.applyPlanExpiry) so the
//         plugin/API path downgrades expired Pro plans just like the session
//         path does. Previously only deserializeUser did this, so a plugin-only
//         user kept Pro perks indefinitely.
//   [SEC] jwt.verify pins algorithms: ['HS256'] to avoid algorithm-confusion.
//         (Requires the applyPlanExpiry() method added to models/User.js.)

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ── Session-based guard (for EJS page routes) ─────────────────
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();

  if (req.session) {
    req.session.returnTo = req.originalUrl; // always a local path — safe to reuse
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    req.user = await User.findById(decoded.id);
    if (!req.user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    // Revocation: a token is only valid at the user's CURRENT version. Missing
    // `tv` (tokens issued before this feature) is treated as version 0, so
    // existing tokens keep working until the user regenerates.
    if ((decoded.tv ?? 0) !== (req.user.tokenVersion ?? 0)) {
      return res.status(403).json({ error: 'Token has been revoked. Please generate a new one.' });
    }

    // Enforce plan expiry on the API path too (was session-only before).
    await req.user.applyPlanExpiry();

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