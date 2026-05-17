// routes/dashboard.js
const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { isAuthenticated } = require('../middleware/isAuthenticated');
const Project = require('../models/Project');

// GET /dashboard
router.get('/', isAuthenticated, async (req, res) => {
  const projects = await Project.find({ owner: req.user._id }).sort({ updatedAt: -1 });
  res.render('pages/dashboard', { title: 'Dashboard', projects });
});

// GET /dashboard/token-reveal
// Returns a fresh JWT for the logged-in session user
// Used by the "Reveal" button on the dashboard
router.get('/token-reveal', isAuthenticated, (req, res) => {
  const token = jwt.sign(
    {
      id:                  req.user._id,
      email:               req.user.email,
      subscription_status: req.user.subscription_status
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token });
});

module.exports = router;
