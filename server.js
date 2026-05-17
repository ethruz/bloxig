// ============================================================
// server.js — Figblox Express Entry Point
// Senior Architect Note: Keep this file thin. Logic lives in
// routes/ and controllers/. This file only wires things up.
// ============================================================

require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const passport   = require('passport');
const path       = require('path');

const connectDB  = require('./config/db');
require('./config/passport')(passport);

// ── Routes ──────────────────────────────────────────────────
const authRoutes        = require('./routes/auth');
const dashboardRoutes   = require('./routes/dashboard');
const marketplaceRoutes = require('./routes/marketplace');
const apiRoutes         = require('./routes/api');
const webhookRoutes     = require('./routes/webhooks');

const app = express();

// ── Connect Database ─────────────────────────────────────────
connectDB();

// ── View Engine ───────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Static Files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Body Parsers ──────────────────────────────────────────────
// NOTE: Stripe webhooks need raw body — mount BEFORE express.json()
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Session ───────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
}));

// ── Passport ──────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ── Global Template Variables ─────────────────────────────────
// Makes `user` available in every EJS template automatically
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

// ── Mount Routes ──────────────────────────────────────────────
app.use('/auth',        authRoutes);
app.use('/dashboard',   dashboardRoutes);
app.use('/marketplace', marketplaceRoutes);
app.use('/api',         apiRoutes);
app.use('/api/webhooks',webhookRoutes);

// ── Landing Page ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.render('pages/index', { title: 'Bloxig — Figma to Roblox' });
});

// ── Docs ──────────────────────────────────────────────────────
app.get('/docs', (req, res) => {
  res.render('pages/docs', { title: 'Docs' });
});

// ── Checkout redirects (Lemon Squeezy — Week 4) ───────────────
app.get('/checkout/pro', (req, res) => {
  // Replace with real Lemon Squeezy checkout URL
  res.redirect('https://bloxig.lemonsqueezy.com/checkout/pro');
});
app.get('/checkout/lifetime', (req, res) => {
  res.redirect('https://bloxig.lemonsqueezy.com/checkout/lifetime');
});

// ── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('pages/404', { title: '404 — Not Found' });
});

// ── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Figblox running at http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
