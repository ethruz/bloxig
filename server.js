// ============================================================
// server.js — Bloxig Express Entry Point v2.2
// CHANGES vs v2.1:
//   [SEC] Body limit scoped: 50mb only under /api (image/plugin payloads);
//         everything else (auth forms, page posts) capped at 100kb — shrinks
//         the memory-DoS surface that a global 50mb limit created.
//   [SEC] JWT_SECRET now required in production at boot, like SESSION_SECRET.
//   [SEC] Dedicated (tighter) limiter on /api/ai/wire — each call costs money.
//   [FIX] /auth/login + /auth/signup rate limiting moved into routes/auth.js
//         (flash + redirect UX instead of raw JSON on the HTML forms).
//   [CLEANUP] aiWire mount comment de-garbled; behavior unchanged.
// ============================================================
require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const passport   = require('passport');
const flash      = require('connect-flash');
const helmet     = require('helmet');
const path       = require('path');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize'); // npm i express-mongo-sanitize
const connectDB  = require('./config/db');
require('./config/passport')(passport);

// ── Routes ───────────────────────────────────────────────────
const authRoutes        = require('./routes/auth');
const dashboardRoutes   = require('./routes/dashboard');
const marketplaceRoutes = require('./routes/marketplace');
const apiRoutes         = require('./routes/api');
const webhookRoutes     = require('./routes/webhooks');
const profileRoutes     = require('./routes/profile');
const imageUploadRoutes = require('./routes/imageUpload');
const aiWireRoutes      = require('./routes/aiWire');        // AI interaction layer

const app = express();

// ── Trust Render proxy ────────────────────────────────────────
app.set('trust proxy', 1);

// Don't advertise the framework
app.disable('x-powered-by');

// ── CORS ──────────────────────────────────────────────────────
// Plugins authenticate with a JWT in the Authorization header (not the session
// cookie), so we never need credentials cross-origin. NEVER pair origin:'*'
// with credentials:true.
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Connect Database ──────────────────────────────────────────
connectDB();

// ── Security headers ──────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));

// ── Rate Limiters ─────────────────────────────────────────────
// NOTE: /auth/login and /auth/signup are rate limited inside routes/auth.js now,
// so they flash + redirect (nice HTML UX) instead of returning JSON here. The
// JSON limiters below stay on the JSON API routes, where JSON responses are correct.

// Kept available for /admin/login once admin routes are mounted here.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// API export: 30 exports per minute (spam protection)
const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many export requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// API token: 5 attempts per 15 minutes (brute force on login)
const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI wiring: each call hits Fireworks/Kimi and costs money — keep it tight.
// Tune this to your real per-user usage; 30/min per IP is a conservative start.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many AI requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API: 100 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply limiters BEFORE routes (tighter/more-specific paths first)
app.use('/api/token',    tokenLimiter);
app.use('/api/export',   exportLimiter);
app.use('/api/ai/wire',  aiLimiter);
app.use('/api',          apiLimiter);

// ── View Engine ───────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Static Files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Body Parsers ──────────────────────────────────────────────
// Webhook signature verification needs the raw body.
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

// Large bodies (base64 image payloads) are only legitimate on the plugin/upload
// endpoints under /api. body-parser skips re-parsing once a body is read, so an
// /api request is parsed here at 50mb and NOT re-parsed by the 100kb parser below.
app.use('/api', express.json({ limit: '50mb' }));
app.use('/api', express.urlencoded({ extended: false, limit: '50mb' }));

// Everything else — auth forms, page posts — only needs a few KB.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Strip Mongo operators ($, .) from req.body/query/params so user input can't
// turn into a query operator (e.g. ?category[$ne]=). Defense-in-depth on top of
// the explicit String() casts in the route handlers.
app.use(mongoSanitize());

// ── Session ───────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production';

// Never fall back to a hardcoded secret in production — fail loudly instead.
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.');
}
// Same for the JWT signing key — an unset/empty secret makes API tokens forgeable.
if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production.');
}

app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev_only_insecure_secret',
  resave:            false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: {
    maxAge:   1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    secure:   isProduction,
    // 'lax' closes classic CSRF: the cookie isn't sent on cross-site POSTs.
    // The plugins use JWT (Authorization header), not this cookie.
    sameSite: 'lax'
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
app.use('/api',          imageUploadRoutes);
app.use('/api/ai/wire',  aiWireRoutes);   // AI wiring endpoints live under /api/ai/wire
app.use('/api/webhooks', webhookRoutes);

// ── Landing Page ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.render('pages/index', { title: 'Bloxig — Figma to Roblox' });
});

// ── Docs ──────────────────────────────────────────────────────
app.get('/docs', (req, res) => {
  res.render('pages/docs', { title: 'Docs' });
});

// ── Legal Pages ───────────────────────────────────────────────
app.get('/terms', (req, res) => {
  res.render('pages/terms', { title: 'Terms of Service' });
});

app.get('/privacy', (req, res) => {
  res.render('pages/privacy', { title: 'Privacy Policy' });
});

// ── Checkout (Lemon Squeezy) ──────────────────────────────────
// Builds a checkout URL with the buyer's email + user_id attached, so the
// webhook can match the payment back to this account. Requires login.
function buildCheckout(baseUrl, user) {
  if (!baseUrl) return '/#pricing';
  const sep = baseUrl.includes('?') ? '&' : '?';
  const params = new URLSearchParams();
  if (user) {
    params.set('checkout[email]', user.email);
    params.set('checkout[custom][user_id]', String(user._id));
  }
  return baseUrl + sep + params.toString();
}

app.get('/checkout/pro', (req, res) => {
  if (!req.user) { req.session.returnTo = '/checkout/pro'; return res.redirect('/auth/login'); }
  return res.redirect(buildCheckout(process.env.LEMON_CHECKOUT_PRO, req.user));
});
app.get('/checkout/lifetime', (req, res) => {
  if (!req.user) { req.session.returnTo = '/checkout/lifetime'; return res.redirect('/auth/login'); }
  return res.redirect(buildCheckout(process.env.LEMON_CHECKOUT_LIFETIME, req.user));
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
  console.log(`\n  🚀 Bloxig running on port ${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}\n`);
});