// routes/marketplace.js
const express = require('express');
const router  = express.Router();
const Asset   = require('../models/Asset');

router.get('/', async (req, res) => {
  const { category } = req.query;
  const filter = category ? { category } : {};
  const assets = await Asset.find(filter).sort({ createdAt: -1 });
  res.render('pages/marketplace', { title: 'Marketplace — Figblox', assets, category: category || 'All' });
});

module.exports = router;
