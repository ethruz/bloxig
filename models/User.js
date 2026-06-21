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
  // When the username was last changed (enforces once-per-30-days rule)
  usernameChangedAt: {
    type: Date,
    default: null
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
  // Chosen avatar, stored as "style:seed:bgcolor" (e.g. "adventurer:Felix:4f7bf7")
  // Empty string = fall back to initials circle.
  avatar: {
    type: String,
    default: ''
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
  // Lemon Squeezy customer portal URL (pause/cancel/card/invoices)
  lemon_portal_url: {
    type: String,
    default: null
  },
  // When a cancelled subscription will actually end (grace period)
  subscription_ends_at: {
    type: Date,
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
  },
  proExpiresAt: {
    type: Date,
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

// ── Virtual: avatarUrl ────────────────────────────────────────
// Builds the DiceBear SVG URL from the stored "style:seed:bg" string.
// Returns null when no avatar is chosen (caller shows initials instead).
UserSchema.virtual('avatarUrl').get(function() {
  if (!this.avatar) return null;
  const parts = this.avatar.split(':');
  if (parts.length < 2) return null;
  const style = encodeURIComponent(parts[0]);
  const seed  = encodeURIComponent(parts[1]);
  const bg    = parts[2] ? parts[2].replace(/[^0-9a-fA-F]/g, '') : '4f7bf7';
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}&backgroundColor=${bg}`;
});

// ── Auto-generate username from email before save ─────────────
UserSchema.pre('save', async function(next) {
  if (!this.username) {
    let base = this.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
    base = base.substring(0, 20);

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
