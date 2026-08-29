// models/User.js — Bloxig Full User Model (hardened)
//
// Changes vs. original:
//   [SEC] toJSON transform strips password_hash / resetToken / resetExpires / apiToken
//         so they can't leak via res.json(user) or JSON.stringify. NOT using
//         select:false on password_hash on purpose — the Passport LocalStrategy
//         needs it on the queried doc to compare passwords. A serialization
//         transform protects the client path without breaking auth.
//   [FIX] toJSON/toObject now expose virtuals (fullName / initials / avatarUrl).
//   [FIX] pre('save') hook: no more async+next() mix, empty-base fallback, attempt cap.
//   [SEC] email now has a schema-level format validator (defense in depth).
//   [PERF] resetToken indexed for the reset lookup.
//
// NOTE on apiToken: still plaintext. If you use it to authenticate API requests,
// hash it before storing (like the reset token) and compare hashes on incoming
// requests. Left as-is because nothing currently reads it.

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({

  // ── Identity ──────────────────────────────────────────────
  firstName: { type: String, required: true, trim: true, maxlength: 50 },
  lastName:  { type: String, required: true, trim: true, maxlength: 50 },
  username: {
    type: String,
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 30
  },
  // When the username was last changed (enforces once-per-30-days rule at route level)
  usernameChangedAt: { type: Date, default: null },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address.']
  },
  password_hash: { type: String, required: true },
  country: { type: String, default: '', trim: true },
  bio: { type: String, default: '', maxlength: 200 },
  // Chosen avatar, stored as "style:seed:bgcolor" (e.g. "adventurer:Felix:4f7bf7")
  // Empty string = fall back to initials circle.
  avatar: { type: String, default: '' },

  // ── Subscription ───────────────────────────────────────────
  subscription_status: {
    type: String,
    enum: ['Free', 'Pro', 'Lifetime'],
    default: 'Free'
  },
  lemon_customer_id:     { type: String, default: null },
  lemon_subscription_id: { type: String, default: null },
  // Keep for backward compat
  stripe_customer_id:    { type: String, default: null },
  // Lemon Squeezy customer portal URL (pause/cancel/card/invoices)
  lemon_portal_url:      { type: String, default: null },
  // When a cancelled subscription will actually end (grace period). Null while active — by design.
  subscription_ends_at:  { type: Date, default: null },
  // Live count of this user's projects. Kept in sync by the export create path
  // ($inc under a $lt guard) and by every project-delete path. Backs the atomic
  // Free-tier cap (no count-then-create race). Backfill once; re-run to repair drift.
  projectCount:          { type: Number, default: 0 },

  // ── Security ───────────────────────────────────────────────
  lastLogin:  { type: Date, default: null },
  loginCount: { type: Number, default: 0 },
  apiToken:   { type: String, default: null }, // no longer stores the live JWT — see note at top
  // Bumped on every token (re)generation. Embedded in the JWT as `tv` and checked
  // in verifyJWT, so regenerating instantly invalidates all previously issued tokens.
  tokenVersion:      { type: Number, default: 0 },
  // When the current API token was generated (for display only — the token itself
  // is shown once and never stored).
  apiTokenCreatedAt: { type: Date, default: null },
  // Admin flag for the /admin panel. Provisioned MANUALLY (set true directly in
  // the DB for your own account) — no route sets this, and none mass-assign
  // req.body, so a user can't grant it to themselves.
  isAdmin:    { type: Boolean, default: false },

  // ── Password reset ─────────────────────────────────────────
  resetToken:   { type: String, default: null, index: true }, // stores sha256(token), not raw
  resetExpires: { type: Date, default: null },

  // ── Voucher ────────────────────────────────────────────────
  voucherUsed:  { type: String, default: null },
  proExpiresAt: { type: Date, default: null }

}, {
  timestamps: true,

  // Expose virtuals, strip secrets on serialization to the client.
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret.password_hash;
      delete ret.resetToken;
      delete ret.resetExpires;
      delete ret.apiToken;
      delete ret.__v;
      return ret;
    }
  },
  // If you ever send a raw .toObject() to a client, add the same transform here.
  toObject: { virtuals: true }
});

// ── Virtual: full name ────────────────────────────────────────
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// ── Virtual: avatar initials ──────────────────────────────────
UserSchema.virtual('initials').get(function() {
  const f = this.firstName ? this.firstName[0].toUpperCase() : '';
  const l = this.lastName  ? this.lastName[0].toUpperCase()  : '';
  return (f + l) || 'U';
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
  const bg    = (parts[2] ? parts[2].replace(/[^0-9a-fA-F]/g, '') : '') || '4f7bf7';
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}&backgroundColor=${bg}`;
});

// ── Method: apply plan expiry ─────────────────────────────────
// Downgrades an expired time-limited Pro plan to Free. Call this on BOTH auth
// paths (deserializeUser for sessions, verifyJWT for the plugin API) so a
// plugin-only user can't keep Pro perks forever. Lifetime plans have
// proExpiresAt = null and are never touched. No-op (and no write) once Free.
UserSchema.methods.applyPlanExpiry = async function() {
  if (
    this.subscription_status === 'Pro' &&
    this.proExpiresAt &&
    new Date(this.proExpiresAt).getTime() < Date.now()
  ) {
    this.subscription_status = 'Free';
    this.proExpiresAt = null;
    await this.save();
  }
  return this;
};

// ── Auto-generate username from email before save ─────────────
// The unique index on `username` is the real guard against duplicates — this
// loop is best-effort to avoid collisions, and callers should handle E11000.
// Modern Mongoose awaits an async pre hook, so we return a promise (no next()).
UserSchema.pre('save', async function() {
  if (this.username) return;

  let base = (this.email || '')
    .split('@')[0]
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .substring(0, 20);

  if (!base) base = 'user'; // e.g. an all-symbol local part -> avoid empty username

  let candidate = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const exists = await mongoose.model('User')
      .findOne({ username: candidate })
      .select('_id')
      .lean();

    if (!exists || exists._id.toString() === this._id.toString()) break;
    candidate = base + Math.floor(1000 + Math.random() * 9000);
  }

  this.username = candidate;
  // If a race still slips a duplicate through, save() throws E11000 and the
  // caller decides what to do — that's expected, not a failure to handle here.
});

module.exports = mongoose.model('User', UserSchema);