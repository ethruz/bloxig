// routes/auth.js — Bloxig Authentication Routes
const express  = require('express');
const router   = express.Router();
const passport = require('passport');
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');
const crypto   = require('crypto');
const { sendResetEmail } = require('../config/mailer');

// ── Password validation rules ──────────────────────────────────
// Min 8, Max 20, must have uppercase, lowercase, number, symbol
const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 20,
  regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,20}$/
};

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
router.post('/login', (req, res, next) => {
  const { email, password } = req.body;

  // Basic input check
  if (!email || !password) {
    req.flash('error', 'Email and password are required.');
    return res.redirect('/auth/login');
  }

  if (!validateEmail(email)) {
    req.flash('error', 'Please enter a valid email address.');
    return res.redirect('/auth/login');
  }

  passport.authenticate('local', async (err, user, info) => {
    if (err) return next(err);

    if (!user) {
      req.flash('error', 'Incorrect email or password. Please try again.');
      return res.redirect('/auth/login');
    }

    req.logIn(user, async (err) => {
      if (err) return next(err);

      // Update last login + count
      try {
        await User.findByIdAndUpdate(user._id, {
          lastLogin:  new Date(),
          $inc: { loginCount: 1 }
        });
      } catch (e) { /* non-fatal */ }

      // Redirect to intended page or dashboard
      const returnTo = req.session.returnTo || '/dashboard';
      delete req.session.returnTo;
      return res.redirect(returnTo);
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
    formData: {} // empty on fresh load
  });
});

// ── POST /auth/signup ─────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { firstName, lastName, email, password, confirmPassword, country } = req.body;

  const renderError = (msg) => {
    return res.render('pages/signup', {
      title:    'Create account',
      error:    msg,
      success:  null,
      countries: COUNTRIES,
      formData: { firstName, lastName, email, country } // preserve entered data
    });
  };

  // ── Field presence checks ────────────────────────────────────
  if (!firstName || firstName.trim().length === 0) return renderError('First name is required.');
  if (!lastName  || lastName.trim().length === 0)  return renderError('Last name is required.');
  if (!email     || email.trim().length === 0)      return renderError('Email is required.');
  if (!password)                                    return renderError('Password is required.');
  if (!country   || country === '')                 return renderError('Please select your country.');

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
    // ── Check existing email ─────────────────────────────────
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return renderError('An account with this email already exists.');

    // ── Hash password ────────────────────────────────────────
    const salt          = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    // ── Create user ──────────────────────────────────────────
    const user = new User({
      firstName:   firstName.trim(),
      lastName:    lastName.trim(),
      email:       email.toLowerCase().trim(),
      password_hash,
      country:     country.trim(),
      lastLogin:   new Date(),
      loginCount:  1
    });

    await user.save();

    // ── Auto login after signup ──────────────────────────────
    req.login(user, (err) => {
      if (err) {
        req.flash('error', 'Account created! Please sign in.');
        return res.redirect('/auth/login');
      }
      req.flash('success', `Welcome to Bloxig, ${user.firstName}!`);
      res.redirect('/dashboard');
    });

  } catch (err) {
    console.error('[Auth] Signup error:', err);
    renderError('Something went wrong. Please try again.');
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
// Show the "enter your email" form.
router.get('/forgot', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('pages/forgot', {
    title:   'Forgot password',
    error:   req.flash('error')[0]   || null,
    success: req.flash('success')[0] || null
  });
});

// ── POST /auth/forgot ─────────────────────────────────────────
// Generate a token, save it on the user, email the reset link.
// Always shows the same success message (don't reveal if an email exists).
router.post('/forgot', async (req, res) => {
  const { email } = req.body;

  if (!email || !validateEmail(email)) {
    req.flash('error', 'Please enter a valid email address.');
    return res.redirect('/auth/forgot');
  }

  const genericMsg = 'If an account with that email exists, we sent a reset link. Check your inbox (and spam).';

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Only actually send if the user exists — but DON'T reveal that either way.
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetToken   = token;
      user.resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();

      try {
        await sendResetEmail(user.email, token, user.firstName);
      } catch (mailErr) {
        console.error('[Auth] Failed to send reset email:', mailErr.message);
        // Roll back the token so a broken email send doesn't leave a dangling token
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
// Show the "new password" form if the token is valid + not expired.
router.get('/reset/:token', async (req, res) => {
  try {
    const user = await User.findOne({
      resetToken:   req.params.token,
      resetExpires: { $gt: new Date() }
    });

    if (!user) {
      req.flash('error', 'That reset link is invalid or has expired. Please request a new one.');
      return res.redirect('/auth/forgot');
    }

    res.render('pages/reset', {
      title: 'Set a new password',
      token: req.params.token,
      error:   req.flash('error')[0]   || null,
      success: null
    });
  } catch (err) {
    console.error('[Auth] Reset GET error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    return res.redirect('/auth/forgot');
  }
});

// ── POST /auth/reset/:token ───────────────────────────────────
// Verify token, validate new password, hash + save, clear token.
router.post('/reset/:token', async (req, res) => {
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
      resetToken:   token,
      resetExpires: { $gt: new Date() }
    });

    if (!user) {
      req.flash('error', 'That reset link is invalid or has expired. Please request a new one.');
      return res.redirect('/auth/forgot');
    }

    // Validate the new password with the same rules as signup
    const passwordError = validatePassword(password);
    if (passwordError) return renderReset(passwordError);
    if (password !== confirmPassword) return renderReset('Passwords do not match.');

    // Hash + save, then clear the token so it can't be reused
    const salt          = await bcrypt.genSalt(12);
    user.password_hash  = await bcrypt.hash(password, salt);
    user.resetToken     = null;
    user.resetExpires   = null;
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
