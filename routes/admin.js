// routes/admin.js — Bloxig Admin Panel
const express  = require('express');
const router   = express.Router();
const passport = require('passport');
const { isAdmin } = require('../middleware/isAdmin');
const User    = require('../models/User');
const Project = require('../models/Project');
const Asset   = require('../models/Asset');

// Escape user input before using it in a $regex so a crafted search can't cause
// catastrophic backtracking (ReDoS).
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── GET /admin/login ──────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.isAuthenticated() && req.user.isAdmin) {
    return res.redirect('/admin');
  }
  res.render('admin/login', {
    title: 'Admin Login',
    error: req.flash('error')[0] || null
  });
});

// ── POST /admin/login ─────────────────────────────────────────
router.post('/login', (req, res, next) => {
  passport.authenticate('local', async (err, user, info) => {
    if (err) return next(err);
    if (!user || !user.isAdmin) {
      req.flash('error', 'Invalid credentials or insufficient permissions.');
      return res.redirect('/admin/login');
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      res.redirect('/admin');
    });
  })(req, res, next);
});

// ── GET /admin/logout ─────────────────────────────────────────
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/admin/login');
  });
});

// ── GET /admin — Dashboard ────────────────────────────────────
router.get('/', isAdmin, async (req, res) => {
  try {
    const [
      totalUsers, freeUsers, proUsers, lifetimeUsers,
      totalProjects, totalAssets,
      recentUsers, recentProjects
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ subscription_status: 'Free' }),
      User.countDocuments({ subscription_status: 'Pro' }),
      User.countDocuments({ subscription_status: 'Lifetime' }),
      Project.countDocuments(),
      Asset.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(5).select('firstName lastName email subscription_status createdAt country'),
      Project.find().sort({ updatedAt: -1 }).limit(5).populate('owner', 'firstName lastName email')
    ]);

    // Signups per day (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const signupsByDay = await User.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: { totalUsers, freeUsers, proUsers, lifetimeUsers, totalProjects, totalAssets },
      recentUsers, recentProjects, signupsByDay,
      admin: req.user
    });
  } catch (err) {
    console.error('[Admin] Dashboard error:', err);
    res.status(500).render('admin/error', { title: 'Error', message: err.message });
  }
});

// ── GET /admin/users ──────────────────────────────────────────
router.get('/users', isAdmin, async (req, res) => {
  try {
    const page    = parseInt(req.query.page) || 1;
    const limit   = 20;
    const search  = req.query.search || '';
    const filter  = req.query.plan || '';
    const query   = {};

    if (search) query.$or = [
      { email: { $regex: escapeRegex(search), $options: 'i' } },
      { firstName: { $regex: escapeRegex(search), $options: 'i' } },
      { lastName: { $regex: escapeRegex(search), $options: 'i' } }
    ];
    if (filter) query.subscription_status = filter;

    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(query)
    ]);

    res.render('admin/users', {
      title: 'Users',
      users, total, page,
      pages: Math.ceil(total / limit),
      search, filter, admin: req.user
    });
  } catch (err) {
    res.status(500).render('admin/error', { title: 'Error', message: err.message });
  }
});

// ── POST /admin/users/:id/plan ────────────────────────────────
router.post('/users/:id/plan', isAdmin, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['Free', 'Pro', 'Lifetime'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }
    await User.findByIdAndUpdate(req.params.id, { subscription_status: plan });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /admin/users/:id/delete ─────────────────────────────
router.post('/users/:id/delete', isAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own admin account.' });
    }
    await User.findByIdAndDelete(req.params.id);
    await Project.deleteMany({ owner: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/assets ─────────────────────────────────────────
router.get('/assets', isAdmin, async (req, res) => {
  try {
    const assets = await Asset.find().sort({ createdAt: -1 });
    res.render('admin/assets', {
      title: 'Marketplace Assets',
      assets, admin: req.user,
      success: req.flash('success')[0] || null,
      error:   req.flash('error')[0]   || null
    });
  } catch (err) {
    res.status(500).render('admin/error', { title: 'Error', message: err.message });
  }
});

// ── POST /admin/assets/create ─────────────────────────────────
router.post('/assets/create', isAdmin, async (req, res) => {
  try {
    const { name, description, price, category, isPro, file_url, preview_url } = req.body;
    if (!name || !description || !category) {
      req.flash('error', 'Name, description and category are required.');
      return res.redirect('/admin/assets');
    }
    await Asset.create({
      name: name.trim(),
      description: description.trim(),
      price: parseInt(price) || 0,
      category: category.trim(),
      isPro: isPro === 'on',
      file_url:    file_url    || '',
      preview_url: preview_url || ''
    });
    req.flash('success', `Asset "${name}" created successfully.`);
    res.redirect('/admin/assets');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/admin/assets');
  }
});

// ── POST /admin/assets/:id/edit ───────────────────────────────
router.post('/assets/:id/edit', isAdmin, async (req, res) => {
  try {
    const { name, description, price, category, isPro, file_url, preview_url } = req.body;
    await Asset.findByIdAndUpdate(req.params.id, {
      name: name.trim(),
      description: description.trim(),
      price: parseInt(price) || 0,
      category: category.trim(),
      isPro: isPro === 'on',
      file_url:    file_url    || '',
      preview_url: preview_url || ''
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /admin/assets/:id/delete ────────────────────────────
router.post('/assets/:id/delete', isAdmin, async (req, res) => {
  try {
    await Asset.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/projects ───────────────────────────────────────
router.get('/projects', isAdmin, async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = 20;
    const search = req.query.search || '';
    const query = search
      ? { name: { $regex: escapeRegex(search), $options: 'i' } }
      : {};

    const [projects, total] = await Promise.all([
      Project.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('owner', 'firstName lastName email subscription_status'),
      Project.countDocuments(query)
    ]);

    res.render('admin/projects', {
      title: 'Projects',
      projects, total, page,
      pages: Math.ceil(total / limit),
      search, admin: req.user
    });
  } catch (err) {
    res.status(500).render('admin/error', { title: 'Error', message: err.message });
  }
});

// ── POST /admin/projects/:id/delete ──────────────────────────
router.post('/projects/:id/delete', isAdmin, async (req, res) => {
  try {
    // Look up the owner first so we can keep their projectCount in sync.
    const proj = await Project.findById(req.params.id).select('owner');
    await Project.findByIdAndDelete(req.params.id);
    if (proj && proj.owner) {
      await User.updateOne({ _id: proj.owner }, { $inc: { projectCount: -1 } });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;