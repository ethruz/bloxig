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

// ── Avatar picker presets (must match the grid in profile.ejs) ─
// Stored value format: "style:seed:bgcolor"
const AVATAR_PRESETS = [
  'adventurer:Felix:4f7bf7',  'adventurer:Aneka:7c5cff',
  'bottts:Rocket:3dd68c',     'bottts:Pixel:f5a623',
  'fun-emoji:Sunny:e5484d',   'fun-emoji:Mochi:14b8c4',
  'big-smile:Coco:4f7bf7',    'big-smile:Pip:7c5cff',
  'lorelei:Sage:3dd68c',      'lorelei:Echo:f5a623',
  'adventurer:Ziggy:e5484d',  'bottts:Volt:14b8c4'
];

// Username change rule: once every 30 days
const USERNAME_COOLDOWN_DAYS = 30;
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/; // lowercase, digits, underscore, 3–20

// ── GET /profile ──────────────────────────────────────────────
router.get('/', isAuthenticated, (req, res) => {
  res.render('pages/profile', {
    title:     'Profile',
    tab:       'account',
    error:     req.flash('error')[0]   || null,
    success:   req.flash('success')[0] || null,
    countries: COUNTRIES,
    avatarPresets: AVATAR_PRESETS
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
    countries: COUNTRIES,
    avatarPresets: AVATAR_PRESETS
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

// ── POST /profile/avatar — Save chosen avatar ─────────────────
router.post('/avatar', isAuthenticated, async (req, res) => {
  const choice = (req.body.avatar || '').trim();

  // Empty string is allowed → resets to initials.
  if (choice !== '' && AVATAR_PRESETS.indexOf(choice) === -1) {
    req.flash('error', 'Invalid avatar selection.');
    return res.redirect('/profile/account');
  }

  try {
    await User.findByIdAndUpdate(req.user._id, { avatar: choice });
    req.flash('success', choice ? 'Avatar updated.' : 'Avatar reset to initials.');
    res.redirect('/profile/account');
  } catch (err) {
    console.error('[Profile] Avatar error:', err);
    req.flash('error', 'Failed to update avatar. Try again.');
    res.redirect('/profile/account');
  }
});

// ── POST /profile/username — Change username (once / 30 days) ─
router.post('/username', isAuthenticated, async (req, res) => {
  const raw = (req.body.username || '').trim().toLowerCase().replace(/^@/, '');

  const fail = (msg) => {
    req.flash('error', msg);
    return res.redirect('/profile/account');
  };

  if (!raw) return fail('Username cannot be empty.');
  if (!USERNAME_REGEX.test(raw)) {
    return fail('Username must be 3–20 characters: lowercase letters, numbers, or underscore only.');
  }

  // No change? Nothing to do.
  if (raw === req.user.username) {
    return fail('That is already your username.');
  }

  // Cooldown check
  const last = req.user.usernameChangedAt;
  if (last) {
    const daysSince = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < USERNAME_COOLDOWN_DAYS) {
      const left = Math.ceil(USERNAME_COOLDOWN_DAYS - daysSince);
      return fail(`You can change your username again in ${left} day${left === 1 ? '' : 's'}.`);
    }
  }

  try {
    // Uniqueness check
    const taken = await User.findOne({ username: raw });
    if (taken && taken._id.toString() !== req.user._id.toString()) {
      return fail('That username is already taken.');
    }

    await User.findByIdAndUpdate(req.user._id, {
      username: raw,
      usernameChangedAt: new Date()
    });

    req.flash('success', 'Username updated.');
    res.redirect('/profile/account');
  } catch (err) {
    console.error('[Profile] Username error:', err);
    // Duplicate-key race condition
    if (err.code === 11000) return fail('That username is already taken.');
    return fail('Failed to update username. Try again.');
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

  const user = await User.findById(req.user._id);
  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) return fail('Current password is incorrect.');

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

    req.flash('success', 'Password changed successfully.');
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
    req.flash('success', `Voucher applied! ${voucher.discount} — enjoy ${voucher.plan}.`);
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
