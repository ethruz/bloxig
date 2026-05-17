// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
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
  stripe_customer_id: {
    type: String,
    default: null
  },
  subscription_status: {
    type: String,
    enum: ['Free', 'Pro', 'Lifetime'],
    default: 'Free'
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
