// routes/dashboard.js
const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { isAuthenticated } = require('../middleware/isAuthenticated');
const Project = require('../models/Project');
const ProjectImages = require('../models/ProjectImages');


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
      id:    req.user._id,
      email: req.user.email,
      tv:    req.user.tokenVersion || 0   // revocation version
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token });
});

// POST /dashboard/projects/:id/delete
// Deletes a project the logged-in user owns. Ownership is enforced by matching
// BOTH the project _id AND owner — so users can only delete their own projects.
router.post('/projects/:id/delete', isAuthenticated, async (req, res) => {
  try {
    const result = await Project.findOneAndDelete({
      _id:   req.params.id,
      owner: req.user._id
    });

    if (!result) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    await ProjectImages.deleteOne({ project: req.params.id });

    return res.json({ success: true });
  } catch (err) {
    console.error('[Dashboard] Delete project error:', err);
    return res.status(500).json({ error: 'Failed to delete project.' });
  }
});

module.exports = router;