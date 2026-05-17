// models/Asset.js
const mongoose = require('mongoose');

const AssetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true }, // in cents for Stripe
  file_url: { type: String, required: true },
  preview_url: { type: String, default: '' },
  category: {
    type: String,
    enum: ['Vector', 'Icon', 'UIKit', 'Template'],
    required: true
  },
  isPro: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Asset', AssetSchema);
