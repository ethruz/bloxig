// config/passport.js — Passport Local Strategy
const LocalStrategy = require('passport-local').Strategy;
const bcrypt        = require('bcryptjs');
const User          = require('../models/User');

module.exports = (passport) => {
  passport.use(new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return done(null, false, { message: 'No account found with that email.' });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return done(null, false, { message: 'Incorrect password.' });

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));

  // Store user ID in session
  passport.serializeUser((user, done) => done(null, user.id));

  // Retrieve user from session
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);

      // ── Auto-expire time-limited paid plans ──────────────────
      // If a Pro plan has a proExpiresAt in the past, downgrade to Free.
      // Lifetime plans have proExpiresAt = null, so they never expire here.
      if (
        user &&
        user.subscription_status === 'Pro' &&
        user.proExpiresAt &&
        new Date(user.proExpiresAt).getTime() < Date.now()
      ) {
        user.subscription_status = 'Free';
        user.proExpiresAt = null;
        await user.save();
      }

      done(null, user);
    } catch (err) {
      done(err);
    }
  });
};
