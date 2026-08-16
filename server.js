// ============================================================
// server.js — Bloxig Express Entry Point v2.1
// ADDED: Rate limiting on all routes
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
const rateLimit  = require('express-rate-limit');  // ← NEW
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
const aiWireRoutes      = require('./routes/aiWire');        // ← NEW (AI interaction layer)

const app = express();

// ── Trust Render proxy ────────────────────────────────────────
app.set('trust proxy', 1);

// Don't advertise the framework (applies even to cors preflight short-circuits)
app.disable('x-powered-by');

// ── CORS ──────────────────────────────────────────────────────
// The plugins authenticate with a JWT in the Authorization header (not the
// session cookie), so we never need credentials cross-origin. Keep this open
// for the Bearer-token API, but NEVER pair origin:'*' with credentials:true.
app.use(cors({
  origin: '*',
  credentials: false,                         // explicit: no cookies cross-origin
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
// Auth routes: 10 attempts per 15 minutes (brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// API export: 30 exports per minute per user (spam protection)
const exportLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
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

// General API: 100 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply limiters BEFORE routes
app.use('/auth/login',    authLimiter);
app.use('/auth/signup',   authLimiter);
app.use('/api/token',     tokenLimiter);
app.use('/api/export',    exportLimiter);
app.use('/api',           apiLimiter);

// ── View Engine ───────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Static Files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Body Parsers ──────────────────────────────────────────────
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));  // raised for image upload payloads  // ← limit payload size
app.use(express.urlencoded({ extended: false }));

// ── Session ───────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production';

// Never fall back to a hardcoded secret in production — fail loudly instead.
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.');
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
    // 'lax' closes CSRF: the cookie is no longer sent on cross-site requests.
    // The plugins use JWT (Authorization header), not this cookie, so nothing
    // legitimate needs it cross-site.
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
app.use('/api/ai/wire', aiWireRoutes);         // ← NEW: defines /api/ai/wire internally app.use('/', aiWireRoutes); -CHNAGES MADE  //
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
