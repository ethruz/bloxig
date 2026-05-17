// scripts/seed.js — Populate DB with sample data
// Run once: node scripts/seed.js

require('dotenv').config();
const mongoose = require('mongoose');
const Asset    = require('../models/Asset');

const assets = [
  {
    name: 'Minimal HUD Pack',
    description: 'Clean health bars, minimaps, and status indicators for modern Roblox games.',
    price: 999,
    file_url: '/assets/files/minimal-hud.rbxm',
    preview_url: '',
    category: 'UIKit',
    isPro: false
  },
  {
    name: 'RPG Icon Set',
    description: '120 hand-crafted icons covering weapons, armor, potions, and skills.',
    price: 499,
    file_url: '/assets/files/rpg-icons.rbxm',
    preview_url: '',
    category: 'Icon',
    isPro: false
  },
  {
    name: 'Sci-Fi Interface Kit',
    description: 'Futuristic panels, terminals, and readouts. Perfect for space or tech games.',
    price: 1499,
    file_url: '/assets/files/scifi-kit.rbxm',
    preview_url: '',
    category: 'UIKit',
    isPro: true
  },
  {
    name: 'Fantasy Vector Pack',
    description: 'Swords, shields, scrolls, and potions as clean vector assets.',
    price: 299,
    file_url: '/assets/files/fantasy-vectors.rbxm',
    preview_url: '',
    category: 'Vector',
    isPro: false
  },
  {
    name: 'Mobile Game Template',
    description: 'Full mobile-first UI template with inventory, shop, and settings screens.',
    price: 2499,
    file_url: '/assets/files/mobile-template.rbxm',
    preview_url: '',
    category: 'Template',
    isPro: true
  },
  {
    name: 'Social Icons Pack',
    description: 'Friends list, chat bubbles, party system icons. Clean and scalable.',
    price: 199,
    file_url: '/assets/files/social-icons.rbxm',
    preview_url: '',
    category: 'Icon',
    isPro: false
  }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    await Asset.deleteMany({});
    console.log('🗑️  Cleared existing assets');

    await Asset.insertMany(assets);
    console.log(`🌱 Seeded ${assets.length} assets`);

    console.log('\nAssets created:');
    assets.forEach(a => console.log(`  · ${a.name} — $${(a.price/100).toFixed(2)} [${a.category}]${a.isPro ? ' (Pro)' : ''}`));

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
