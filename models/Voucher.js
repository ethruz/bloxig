// models/Voucher.js — Bloxig voucher codes (moved out of source into the DB)
//
// Seed your codes once (rotate any that were ever committed to source). Example:
//   const Voucher = require('./models/Voucher');
//   await Voucher.create([
//     { code: 'BLOXIG2026', plan: 'Pro',      discount: '1 month free',  durationDays: 30 },
//     { code: 'BCALAUNCH',  plan: 'Pro',      discount: '3 months free', durationDays: 90 },
//     // Rotate LIFETIME50 -> a fresh code, and cap it so it can't be farmed:
//     { code: 'LIFE-<NEW-RANDOM>', plan: 'Lifetime', discount: '$50 off', durationDays: null, maxRedemptions: 100 },
//   ]);

const mongoose = require('mongoose');

const VoucherSchema = new mongoose.Schema({
  code:         { type: String, required: true, unique: true, uppercase: true, trim: true },
  plan:         { type: String, enum: ['Pro', 'Lifetime'], required: true },
  discount:     { type: String, default: '' },
  // null = no expiry (Lifetime); a number = days of Pro.
  durationDays: { type: Number, default: null },
  active:       { type: Boolean, default: true },
  // null = unlimited; a number caps total redemptions so a leaked code can't be farmed.
  maxRedemptions: { type: Number, default: null },
  timesRedeemed:  { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Voucher', VoucherSchema);
