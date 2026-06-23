// routes/api.js — Bloxig Core Plugin Bridge v2.1
// ADDED: Free tier 3-project limit enforced on /export
const express       = require('express');
const router        = express.Router();
const jwt           = require('jsonwebtoken');
const { verifyJWT } = require('../middleware/isAuthenticated');
const Project       = require('../models/Project');

// ── POST /api/export ──────────────────────────────────────────
// Called by Figma Plugin. Saves JSON layout to a Project.
router.post('/export', verifyJWT, async (req, res) => {
  const { figma_file_id, figma_frame_id, name, json_layout_data } = req.body;

  if (!json_layout_data) {
    return res.status(400).json({ error: 'json_layout_data is required.' });
  }

  // Guard: bundled images (base64 PNGs) live inside json_layout_data. MongoDB
  // documents cap at 16MB; reject oversized payloads with a clear message
  // instead of a cryptic DB error. ~14MB leaves room for the rest of the doc.
  try {
    const approxBytes = Buffer.byteLength(JSON.stringify(json_layout_data), 'utf8');
    if (approxBytes > 14 * 1024 * 1024) {
      return res.status(413).json({
        error: 'payload_too_large',
        message: 'This design has too many or too large images to sync (over ~14MB). ' +
                 'Try exporting fewer image-heavy frames at once, or reduce image sizes.'
      });
    }
  } catch (e) { /* if stringify fails, let it proceed and DB will validate */ }
  if (!figma_frame_id) {
    return res.status(400).json({ error: 'figma_frame_id is required.' });
  }

  try {
    // Does a project for THIS frame already exist? (update vs new)
    const existing = await Project.findOne({
      owner: req.user._id,
      figma_frame_id
    });

    // Enforce the Free-tier project cap on NEW projects only.
    if (!existing) {
      const plan = req.user.subscription_status || 'Free';
      const FREE_LIMIT = 3;

      if (plan === 'Free') {
        const count = await Project.countDocuments({ owner: req.user._id });
        if (count >= FREE_LIMIT) {
          return res.status(403).json({
            error: 'limit_reached',
            message: `Free plan is limited to ${FREE_LIMIT} projects. Upgrade to Pro for unlimited projects.`,
            limit: FREE_LIMIT
          });
        }
      }
    }

    // Update the existing frame's project, or create a new one.
    const project = await Project.findOneAndUpdate(
      { owner: req.user._id, figma_frame_id },
      {
        name: name || 'Untitled',
        figma_file_id: figma_file_id || 'local',
        figma_frame_id,
        json_layout_data,
        updatedAt: new Date()
      },
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
      _id:   req.params.id,
      owner: req.user._id
    });

    if (!project) return res.status(404).json({ error: 'Project not found.' });

    res.json({ success: true, json_layout_data: project.json_layout_data });

  } catch (err) {
    console.error('[API] Import error:', err);
    res.status(500).json({ error: 'Import failed.' });
  }
});

// ── POST /api/token ───────────────────────────────────────────
// Issues a JWT for plugin auth (called after browser login)
// Note: rate limited to 5 attempts/15min in server.js
router.post('/token', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const bcrypt = require('bcryptjs');
  const User   = require('../models/User');

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: user._id, email: user.email, subscription_status: user.subscription_status },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        email: user.email,
        firstName: user.firstName,
        subscription_status: user.subscription_status
      }
    });

  } catch (err) {
    console.error('[API] Token error:', err);
    res.status(500).json({ error: 'Authentication failed.' });
  }
});

// ── GET /api/projects ─────────────────────────────────────────
// Returns all projects for the logged-in user
router.get('/projects', verifyJWT, async (req, res) => {
  try {
    const projects = await Project.find(
      { owner: req.user._id },
      { name: 1, figma_file_id: 1, updatedAt: 1, createdAt: 1 }
    ).sort({ updatedAt: -1 });

    res.json({
      success: true,
      projects,
      count: projects.length,
      limit: req.user.subscription_status === 'Free' ? 3 : null
    });
  } catch (err) {
    console.error('[API] Projects error:', err);
    res.status(500).json({ error: 'Failed to fetch projects.' });
  }
});

module.exports = router;
