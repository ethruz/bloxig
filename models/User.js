// models/User.js — Bloxig Full User Model
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({

  // ── Identity ──────────────────────────────────────────────
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  username: {
    type: String,
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password_hash: {
    type: String,
    required: true
  },
  country: {
    type: String,
    default: '',
    trim: true
  },
  bio: {
    type: String,
    default: '',
    maxlength: 200
  },

  // ── Subscription ───────────────────────────────────────────
  subscription_status: {
    type: String,
    enum: ['Free', 'Pro', 'Lifetime'],
    default: 'Free'
  },
  lemon_customer_id: {
    type: String,
    default: null
  },
  lemon_subscription_id: {
    type: String,
    default: null
  },
  // Keep for backward compat
  stripe_customer_id: {
    type: String,
    default: null
  },

  // ── Security ───────────────────────────────────────────────
  lastLogin: {
    type: Date,
    default: null
  },
  loginCount: {
    type: Number,
    default: 0
  },
  apiToken: {
    type: String,
    default: null
  },

  // ── Voucher ────────────────────────────────────────────────
  voucherUsed: {
    type: String,
    default: null
  }

}, { timestamps: true });

// ── Virtual: full name ────────────────────────────────────────
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// ── Virtual: avatar initials ──────────────────────────────────
UserSchema.virtual('initials').get(function() {
  const f = this.firstName ? this.firstName[0].toUpperCase() : '';
  const l = this.lastName  ? this.lastName[0].toUpperCase()  : '';
  return f + l || 'U';
});

// ── Auto-generate username from email before save ─────────────
UserSchema.pre('save', async function(next) {
  if (!this.username) {
    // Take part before @ and remove special chars
    let base = this.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
    base = base.substring(0, 20);

    // Check uniqueness, append random digits if taken
    let candidate = base;
    let exists = await mongoose.model('User').findOne({ username: candidate });
    while (exists && exists._id.toString() !== this._id.toString()) {
      candidate = base + Math.floor(Math.random() * 9000 + 1000);
      exists = await mongoose.model('User').findOne({ username: candidate });
    }
    this.username = candidate;
  }
  next();
});

module.exports = mongoose.model('User', UserSchema);
