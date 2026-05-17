// routes/api.js — Core Plugin Bridge Endpoints
const express        = require('express');
const router         = express.Router();
const jwt            = require('jsonwebtoken');
const { verifyJWT }  = require('../middleware/isAuthenticated');
const Project        = require('../models/Project');

// ── POST /api/export ──────────────────────────────────────────
// Called by Figma Plugin. Saves JSON layout to a Project.
// Body: { figma_file_id, name, json_layout_data }
router.post('/export', verifyJWT, async (req, res) => {
  const { figma_file_id, name, json_layout_data } = req.body;

  if (!json_layout_data) {
    return res.status(400).json({ error: 'json_layout_data is required.' });
  }

  try {
    // Upsert: update existing project or create a new one
    const project = await Project.findOneAndUpdate(
      { owner: req.user._id, figma_file_id },
      { name: name || 'Untitled', json_layout_data, updatedAt: new Date() },
      { new: true, upsert: true }
    );

    res.json({ success: true, project_id: project._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Export failed.' });
  }
});

// ── GET /api/import/:id ───────────────────────────────────────
// Called by Roblox Plugin. Returns JSON layout by project ID.
router.get('/import/:id', verifyJWT, async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      owner: req.user._id
    });

    if (!project) return res.status(404).json({ error: 'Project not found.' });

    res.json({ success: true, json_layout_data: project.json_layout_data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Import failed.' });
  }
});

// ── POST /api/token ───────────────────────────────────────────
// Issues a JWT for plugin auth (called after browser login)
router.post('/token', async (req, res) => {
  const { email, password } = req.body;
  const bcrypt = require('bcryptjs');
  const User   = require('../models/User');

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

  const token = jwt.sign(
    { id: user._id, email: user.email, subscription_status: user.subscription_status },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({ token });
});

module.exports = router;
