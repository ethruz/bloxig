//cat > /mnt/user-data/outputs/figblox/server.js << 'SERVEREOF'
// ============================================================
// server.js — Bloxig Express Entry Point
// ============================================================

require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const passport   = require('passport');
const flash      = require('connect-flash');
const helmet     = require('helmet');
const path       = require('path');

const connectDB  = require('./config/db');
require('./config/passport')(passport);

// ── Routes ────────────────────────────────────────────────────
const authRoutes        = require('./routes/auth');
const dashboardRoutes   = require('./routes/dashboard');
const marketplaceRoutes = require('./routes/marketplace');
const apiRoutes         = require('./routes/api');
const webhookRoutes     = require('./routes/webhooks');
const profileRoutes     = require('./routes/profile');

const app = express();

// ── Trust Render proxy (MUST be before session) ───────────────
// Required for secure cookies to work on Render + Firefox
app.set('trust proxy', 1);

// ── Connect Database ──────────────────────────────────────────
connectDB();

// ── Security headers ──────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false
}));

// ── View Engine ───────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Static Files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Body Parsers ──────────────────────────────────────────────
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Session ───────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production';

app.use(session({
  secret:            process.env.SESSION_SECRET || 'fallback_secret_change_this',
  resave:            false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: {
    maxAge:   1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    secure:   isProduction,   // HTTPS only on Render
    sameSite: isProduction ? 'none' : 'lax' // 'none' required for cross-site + Firefox
  }
}));

// ── Passport ──────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ── Flash messages ────────────────────────────────────────────
app.use(flash());

// ── Global Template Variables ─────────────────────────────────
app.use((req, res, next) => {
  res.locals.user    = req.user || null;
  res.locals.error   = req.flash('error')[0]   || null;
  res.locals.success = req.flash('success')[0] || null;
  next();
});

// ── Mount Routes ──────────────────────────────────────────────
app.use('/auth',         authRoutes);
app.use('/dashboard',    dashboardRoutes);
app.use('/marketplace',  marketplaceRoutes);
app.use('/profile',      profileRoutes);
app.use('/api',          apiRoutes);
app.use('/api/webhooks', webhookRoutes);

// ── Landing Page ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.render('pages/index', { title: 'Bloxig — Figma to Roblox' });
});

// ── Docs ──────────────────────────────────────────────────────
app.get('/docs', (req, res) => {
  res.render('pages/docs', { title: 'Docs' });
});

// ── Checkout (Lemon Squeezy) ──────────────────────────────────
app.get('/checkout/pro', (req, res) => {
  res.redirect('https://bloxig.lemonsqueezy.com/checkout/pro');
});
app.get('/checkout/lifetime', (req, res) => {
  res.redirect('https://bloxig.lemonsqueezy.com/checkout/lifetime');
});

// ── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('pages/404', { title: '404 — Not Found' });
});

// ── Error Handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.stack);
  res.status(500).render('pages/404', { title: 'Something went wrong' });
});

// ── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Bloxig running at http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
