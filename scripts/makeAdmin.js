// scripts/makeAdmin.js

require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('../models/User');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/makeAdmin.js your@email.com');
  process.exit(1);
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { isAdmin: true },
    { new: true }
  );
  if (!user) {
    console.error(`No user found with email: ${email}`);
  } else {
    console.log(`✅ ${user.email} is now an admin!`);
  }
  await mongoose.disconnect();
}

run().catch(console.error);
