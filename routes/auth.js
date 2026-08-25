// routes/auth.js — Bloxig Authentication Routes (hardened)
//
// Changes vs. original (see notes at bottom for wiring you must do in app.js):
//   [SEC] Reset tokens are now hashed (sha256) at rest — raw token only goes in the email.
//   [SEC] Session is regenerated on login + signup auto-login (session fixation).
//   [SEC] returnTo redirect is restricted to local paths (open-redirect guard).
//   [SEC] Rate limiting on /login, /forgot, /reset (brute force / email bombing).
//   [FIX] Duplicate-email race now handled via Mongo E11000 in addition to findOne.
//   [CLEANUP] Removed the dead unused regex in PASSWORD_RULES.
//
// Intentionally NOT changed (Copilot was wrong on these):
//   - login's findByIdAndUpdate swallow is deliberate: a failed loginCount bump
//     must not fail an already-successful login.
//   - reset uses a single save(); if it fails nothing persists and the token stays
//     valid, which is correct. Do NOT clear-then-resave.

const express   = require('express');
const router    = express.Router();
const passport  = require('passport');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit'); // npm i express-rate-limit
const User      = require('../models/User');
const { sendResetEmail } = require('../config/mailer');

// ── Password validation rules ──────────────────────────────────
// NOTE: maxLength 20 is a product choice. It blocks passphrases and password-
// manager output — consider raising to 64/128. Left as-is; change if you want.
const PASSWORD_RULES = { minLength: 8, maxLength: 20 };

function validatePassword(password) {
  if (!password || password.length < PASSWORD_RULES.minLength) {
    return 'Password must be at least 8 characters.';
  }
  if (password.length > PASSWORD_RULES.maxLength) {
    return 'Password must be 20 characters or fewer.';
  }
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/\d/.test(password))    return 'Password must include a number.';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must include a special character (e.g. @, #, $, !).';
  }
  return null; // null = valid
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Hash a reset token before storing / looking it up, so a DB leak can't be
// replayed as an account takeover. The raw token is only ever sent by email.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Open-redirect guard: only allow same-site absolute paths.
function safeLocalPath(target) {
  if (
    typeof target === 'string' &&
    target.startsWith('/') &&
    !target.startsWith('//') &&      // protocol-relative //evil.com
    !target.startsWith('/\\')        // /\evil.com
  ) {
    return target;
  }
  return '/dashboard';
}

// ── Rate limiters ─────────────────────────────────────────────
// IMPORTANT (Render): these key off req.ip. Behind Render's proxy you MUST set
//   app.set('trust proxy', 1);
// in app.js or every request looks like it comes from one IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Too many login attempts. Please wait a few minutes and try again.');
    res.redirect('/auth/login');
  }
});

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Too many sign-up attempts. Please wait a few minutes and try again.');
    res.redirect('/auth/signup');
  }
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Too many requests. Please wait a while before trying again.');
    res.redirect('/auth/forgot');
  }
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Too many attempts. Please request a new reset link.');
    res.redirect('/auth/forgot');
  }
});

// ── Country list ──────────────────────────────────────────────
const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Argentina','Australia','Austria',
  'Bangladesh','Belgium','Bolivia','Brazil','Cambodia','Canada','Chile',
  'China','Colombia','Croatia','Czech Republic','Denmark','Ecuador','Egypt',
  'Ethiopia','Finland','France','Germany','Ghana','Greece','Guatemala',
  'Hungary','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy',
  'Japan','Jordan','Kenya','South Korea','Malaysia','Mexico','Morocco',
  'Myanmar','Nepal','Netherlands','New Zealand','Nigeria','Norway','Pakistan',
  'Peru','Philippines','Poland','Portugal','Romania','Russia','Saudi Arabia',
  'Serbia','Singapore','South Africa','Spain','Sri Lanka','Sweden','Switzerland',
  'Thailand','Turkey','Ukraine','United Arab Emirates','United Kingdom',
  'United States','Uruguay','Venezuela','Vietnam','Other'
];

// ── GET /auth/login ───────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('pages/login', {
    title: 'Sign in',
    error:   req.flash('error')[0]   || null,
    success: req.flash('success')[0] || null
  });
});

// ── POST /auth/login ──────────────────────────────────────────
router.post('/login', loginLimiter, (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    req.flash('error', 'Email and password are required.');
    return res.redirect('/auth/login');
  }
  if (!validateEmail(email)) {
    req.flash('error', 'Please enter a valid email address.');
    return res.redirect('/auth/login');
  }

  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);

    if (!user) {
      req.flash('error', 'Incorrect email or password. Please try again.');
      return res.redirect('/auth/login');
    }

    // Capture returnTo before regenerate wipes the session.
    const returnTo = safeLocalPath(req.session.returnTo);

    // Regenerate session to prevent session fixation, THEN log in so passport
    // writes the user into the fresh session.
    req.session.regenerate((regenErr) => {
      if (regenErr) return next(regenErr);

      req.logIn(user, async (loginErr) => {
        if (loginErr) return next(loginErr);

        // Non-fatal: don't fail an authenticated login if this bump fails.
        try {
          await User.findByIdAndUpdate(user._id, {
            lastLogin: new Date(),
            $inc: { loginCount: 1 }
          });
        } catch (e) {
          console.warn('[Auth] loginCount update failed (non-fatal):', e.message);
        }

        return res.redirect(returnTo);
      });
    });
  })(req, res, next);
});

// ── GET /auth/signup ──────────────────────────────────────────
router.get('/signup', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('pages/signup', {
    title:   'Create account',
    error:   req.flash('error')[0]   || null,
    success: req.flash('success')[0] || null,
    countries: COUNTRIES,
    formData: {}
  });
});

// ── POST /auth/signup ─────────────────────────────────────────
router.post('/signup', signupLimiter, async (req, res, next) => {
  const { firstName, lastName, email, password, confirmPassword, country } = req.body;

  const renderError = (msg) => res.render('pages/signup', {
    title:    'Create account',
    error:    msg,
    success:  null,
    countries: COUNTRIES,
    formData: { firstName, lastName, email, country }
  });

  // ── Field presence checks ────────────────────────────────────
  if (!firstName || firstName.trim().length === 0) return renderError('First name is required.');
  if (!lastName  || lastName.trim().length === 0)  return renderError('Last name is required.');
  if (!email     || email.trim().length === 0)     return renderError('Email is required.');
  if (!password)                                   return renderError('Password is required.');
  if (!country   || country === '')                return renderError('Please select your country.');

  // ── Name length checks ───────────────────────────────────────
  if (firstName.trim().length > 50) return renderError('First name is too long (max 50 characters).');
  if (lastName.trim().length  > 50) return renderError('Last name is too long (max 50 characters).');

  // ── Email format ─────────────────────────────────────────────
  if (!validateEmail(email)) return renderError('Please enter a valid email address.');

  // ── Password strength ────────────────────────────────────────
  const passwordError = validatePassword(password);
  if (passwordError) return renderError(passwordError);

  // ── Password confirmation ────────────────────────────────────
  if (password !== confirmPassword) return renderError('Passwords do not match.');

  try {
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return renderError('An account with this email already exists.');

    const salt          = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const user = new User({
      firstName:  firstName.trim(),
      lastName:   lastName.trim(),
      email:      normalizedEmail,
      password_hash,
      country:    country.trim(),
      lastLogin:  new Date(),
      loginCount: 1
    });

    await user.save();

    // Regenerate session before auto-login (session fixation).
    req.session.regenerate((regenErr) => {
      if (regenErr) return next(regenErr);

      req.login(user, (loginErr) => {
        if (loginErr) {
          req.flash('error', 'Account created! Please sign in.');
          return res.redirect('/auth/login');
        }
        req.flash('success', `Welcome to Bloxig, ${user.firstName}!`);
        res.redirect('/dashboard');
      });
    });

  } catch (err) {
    // Handles the findOne→save race: two concurrent signups for the same email.
    // Requires a unique index on email in the User schema:  email: { unique: true }
    if (err && err.code === 11000) {
      return renderError('An account with this email already exists.');
    }
    console.error('[Auth] Signup error:', err);
    return renderError('Something went wrong. Please try again.');
  }
});

// ── GET /auth/logout ──────────────────────────────────────────
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.flash('success', 'You have been signed out.');
    res.redirect('/');
  });
});

// ── GET /auth/forgot ──────────────────────────────────────────
router.get('/forgot', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('pages/forgot', {
    title:   'Forgot password',
    error:   req.flash('error')[0]   || null,
    success: req.flash('success')[0] || null
  });
});

// ── POST /auth/forgot ─────────────────────────────────────────
// Always shows the same success message so we don't reveal whether an email
// exists. NOTE: there is still a small timing side-channel — the "user exists"
// path does DB writes + an email send. Rate limiting above is the practical
// mitigation; fully closing it needs a background/queued send.
router.post('/forgot', forgotLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email || !validateEmail(email)) {
    req.flash('error', 'Please enter a valid email address.');
    return res.redirect('/auth/forgot');
  }

  const genericMsg = 'If an account with that email exists, we sent a reset link. Check your inbox (and spam).';

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      user.resetToken   = hashToken(rawToken);                       // store hash
      user.resetExpires = new Date(Date.now() + 60 * 60 * 1000);     // 1 hour
      await user.save();

      try {
        await sendResetEmail(user.email, rawToken, user.firstName);  // email raw token
      } catch (mailErr) {
        console.error('[Auth] Failed to send reset email:', mailErr.message);
        user.resetToken   = null;
        user.resetExpires = null;
        await user.save();
        req.flash('error', 'We could not send the email right now. Please try again later.');
        return res.redirect('/auth/forgot');
      }
    }

    req.flash('success', genericMsg);
    return res.redirect('/auth/forgot');
  } catch (err) {
    console.error('[Auth] Forgot password error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    return res.redirect('/auth/forgot');
  }
});

// ── GET /auth/reset/:token ────────────────────────────────────
router.get('/reset/:token', async (req, res) => {
  try {
    const user = await User.findOne({
      resetToken:   hashToken(req.params.token),   // hash before lookup
      resetExpires: { $gt: new Date() }
    });

    if (!user) {
      req.flash('error', 'That reset link is invalid or has expired. Please request a new one.');
      return res.redirect('/auth/forgot');
    }

    res.render('pages/reset', {
      title: 'Set a new password',
      token: req.params.token,   // pass the raw token back to the form
      error:   req.flash('error')[0] || null,
      success: null
    });
  } catch (err) {
    console.error('[Auth] Reset GET error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    return res.redirect('/auth/forgot');
  }
});

// ── POST /auth/reset/:token ───────────────────────────────────
router.post('/reset/:token', resetLimiter, async (req, res) => {
  const { password, confirmPassword } = req.body;
  const token = req.params.token;

  const renderReset = (msg) => res.render('pages/reset', {
    title: 'Set a new password',
    token,
    error: msg,
    success: null
  });

  try {
    const user = await User.findOne({
      resetToken:   hashToken(token),   // hash before lookup
      resetExpires: { $gt: new Date() }
    });

    if (!user) {
      req.flash('error', 'That reset link is invalid or has expired. Please request a new one.');
      return res.redirect('/auth/forgot');
    }

    const passwordError = validatePassword(password);
    if (passwordError) return renderReset(passwordError);
    if (password !== confirmPassword) return renderReset('Passwords do not match.');

    // Single atomic-ish save: password + token clear together. If it fails,
    // nothing persists and the token stays valid — correct behavior.
    const salt         = await bcrypt.genSalt(12);
    user.password_hash = await bcrypt.hash(password, salt);
    user.resetToken    = null;
    user.resetExpires  = null;
    await user.save();

    req.flash('success', 'Your password has been reset. Please sign in.');
    return res.redirect('/auth/login');
  } catch (err) {
    console.error('[Auth] Reset POST error:', err);
    return renderReset('Something went wrong. Please try again.');
  }
});

module.exports = router;
module.exports.COUNTRIES = COUNTRIES;