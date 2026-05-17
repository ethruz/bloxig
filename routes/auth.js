// routes/auth.js
const express  = require('express');
const router   = express.Router();
const passport = require('passport');
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');

// GET /auth/login
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('pages/login', { title: 'Login — Figblox', error: null });
});

// POST /auth/login
router.post('/login', passport.authenticate('local', {
  successRedirect: '/dashboard',
  failureRedirect: '/auth/login',
  failureFlash: false // We'll add flash later
}));

// GET /auth/signup
router.get('/signup', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('pages/signup', { title: 'Sign Up — Figblox', error: null });
});

// POST /auth/signup
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.render('pages/signup', { title: 'Sign Up — Figblox', error: 'Email already registered.' });
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const user = new User({ email, password_hash });
    await user.save();

    req.login(user, (err) => {
      if (err) throw err;
      res.redirect('/dashboard');
    });
  } catch (err) {
    console.error(err);
    res.render('pages/signup', { title: 'Sign Up — Figblox', error: 'Something went wrong. Try again.' });
  }
});

// GET /auth/logout
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/');
  });
});

module.exports = router;
