// scripts/makeAdmin.js — grant admin rights to one account.
//
// Nothing in the app sets isAdmin (by design), so provision your own account
// with this once. It writes to whatever MONGODB_URI points at in your .env —
// which is your Atlas cluster, i.e. the SAME database Render uses. So running
// this locally makes you admin on the live site too.
//
// Usage:
//   node scripts/makeAdmin.js you@example.com          (grant)
//   node scripts/makeAdmin.js you@example.com --revoke (remove)

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
  const email  = (process.argv[2] || '').toLowerCase().trim();
  const revoke = process.argv.includes('--revoke');

  if (!email) {
    console.error('Usage: node scripts/makeAdmin.js <email> [--revoke]');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set — check your .env.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const res = await User.updateOne({ email }, { $set: { isAdmin: !revoke } });
    if (res.matchedCount === 0) {
      console.error('No user found with email: ' + email);
    } else {
      console.log((revoke ? '🔻 Revoked admin from ' : '✅ ') + email + (revoke ? '' : ' is now an admin.'));
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await mongoose.disconnect();
  }
})();
