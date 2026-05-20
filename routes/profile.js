// routes/profile.js — Bloxig Profile & Settings Routes
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { isAuthenticated } = require('../middleware/isAuthenticated');
const User    = require('../models/User');

// Valid countries (import from auth)
const { COUNTRIES } = require('./auth');

// ── Voucher codes (hardcoded for now — move to DB later) ───────
const VALID_VOUCHERS = {
  'BLOXIG2026':  { plan: 'Pro',      discount: '1 month free' },
  'BCALAUNCH':   { plan: 'Pro',      discount: '3 months free' },
  'LIFETIME50':  { plan: 'Lifetime', discount: '$50 off' },
};

// ── GET /profile ──────────────────────────────────────────────
router.get('/', isAuthenticated, (req, res) => {
  res.render('pages/profile', {
    title:     'Profile',
    tab:       'account',
    error:     req.flash('error')[0]   || null,
    success:   req.flash('success')[0] || null,
    countries: COUNTRIES
  });
});

// ── GET /profile/:tab ─────────────────────────────────────────
router.get('/:tab', isAuthenticated, (req, res) => {
  const validTabs = ['account', 'security', 'billing', 'developer'];
  const tab = validTabs.includes(req.params.tab) ? req.params.tab : 'account';

  res.render('pages/profile', {
    title:     'Profile',
    tab,
    error:     req.flash('error')[0]   || null,
    success:   req.flash('success')[0] || null,
    countries: COUNTRIES
  });
});

// ── POST /profile/update — Update name/country/bio ────────────
router.post('/update', isAuthenticated, async (req, res) => {
  const { firstName, lastName, country, bio } = req.body;

  if (!firstName || firstName.trim().length === 0) {
    req.flash('error', 'First name cannot be empty.');
    return res.redirect('/profile/account');
  }
  if (!lastName || lastName.trim().length === 0) {
    req.flash('error', 'Last name cannot be empty.');
    return res.redirect('/profile/account');
  }

  try {
    await User.findByIdAndUpdate(req.user._id, {
      firstName: firstName.trim().substring(0, 50),
      lastName:  lastName.trim().substring(0, 50),
      country:   country  || req.user.country,
      bio:       (bio || '').trim().substring(0, 200)
    });

    req.flash('success', 'Profile updated successfully.');
    res.redirect('/profile/account');
  } catch (err) {
    console.error('[Profile] Update error:', err);
    req.flash('error', 'Failed to update profile. Try again.');
    res.redirect('/profile/account');
  }
});

// ── POST /profile/password — Change password ──────────────────
router.post('/password', isAuthenticated, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  const fail = (msg) => {
    req.flash('error', msg);
    return res.redirect('/profile/security');
  };

  if (!currentPassword || !newPassword || !confirmPassword) {
    return fail('All password fields are required.');
  }

  // Verify current password
  const user = await User.findById(req.user._id);
  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) return fail('Current password is incorrect.');

  // Validate new password strength
  const rules = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,20}$/;
  if (!rules.test(newPassword)) {
    return fail('New password must be 8–20 characters with uppercase, lowercase, number, and special character.');
  }

  if (newPassword !== confirmPassword) return fail('New passwords do not match.');
  if (newPassword === currentPassword)  return fail('New password must be different from current password.');

  try {
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(newPassword, salt);
    await User.findByIdAndUpdate(req.user._id, { password_hash });

    req.flash('success', 'Password changed successfully. Stay secure! 🔒');
    res.redirect('/profile/security');
  } catch (err) {
    console.error('[Profile] Password change error:', err);
    req.flash('error', 'Failed to change password. Try again.');
    res.redirect('/profile/security');
  }
});

// ── POST /profile/voucher — Redeem voucher code ───────────────
router.post('/voucher', isAuthenticated, async (req, res) => {
  const code = (req.body.voucherCode || '').toUpperCase().trim();

  if (!code) {
    req.flash('error', 'Please enter a voucher code.');
    return res.redirect('/profile/billing');
  }

  // Already used a voucher
  if (req.user.voucherUsed) {
    req.flash('error', 'You have already redeemed a voucher on this account.');
    return res.redirect('/profile/billing');
  }

  const voucher = VALID_VOUCHERS[code];
  if (!voucher) {
    req.flash('error', 'Invalid or expired voucher code.');
    return res.redirect('/profile/billing');
  }

  try {
    const update = {
      voucherUsed: code,
      ...(voucher.plan === 'Lifetime' ? { subscription_status: 'Lifetime' } : {}),
      ...(voucher.plan === 'Pro' && req.user.subscription_status === 'Free'
        ? { subscription_status: 'Pro' } : {})
    };

    await User.findByIdAndUpdate(req.user._id, update);
    req.flash('success', `Voucher applied! ${voucher.discount} — enjoy ${voucher.plan}! 🎉`);
    res.redirect('/profile/billing');
  } catch (err) {
    req.flash('error', 'Failed to apply voucher. Try again.');
    res.redirect('/profile/billing');
  }
});

// ── POST /profile/generate-token — Generate/regenerate API token
router.post('/generate-token', isAuthenticated, async (req, res) => {
  try {
    const token = jwt.sign(
      {
        id:                  req.user._id,
        email:               req.user.email,
        subscription_status: req.user.subscription_status
      },
      process.env.JWT_SECRET,
      { expiresIn: '365d' }
    );

    await User.findByIdAndUpdate(req.user._id, { apiToken: token });

    req.flash('success', 'New API token generated. Copy it — it will be hidden after you leave this page.');
    res.redirect('/profile/developer');
  } catch (err) {
    req.flash('error', 'Failed to generate token.');
    res.redirect('/profile/developer');
  }
});

module.exports = router;
