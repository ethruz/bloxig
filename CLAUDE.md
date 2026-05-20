# CLAUDE.md — Bloxig Architect Memory
> **READ THIS FIRST on every session.** This is the single source of truth.

---

## 🧠 Project Identity

| Key | Value |
|-----|-------|
| **Project Name** | Bloxig (formerly Figblox) |
| **Tagline** | Figma to Roblox, without the manual work |
| **Developer** | BCA 5th Semester — "vibe coder" |
| **Goal** | Professional SaaS launch within 30-day sprint |
| **Runtime** | Node.js v18 |
| **Templating** | EJS |
| **Folder on disk** | `~/Desktop/bloxfig/` (folder name is bloxfig, project name is Bloxig) |

---

## 🎨 Design System (v2 — CURRENT)

**Aesthetic**: Linear / Vercel dark — professional SaaS. NOT gaming/cyberpunk.

> ⚠️ Do NOT reintroduce glows, glassmorphism, neon colors, or Orbitron font.
> Hover effects = subtle lift/border-brighten only. No glow, no neon.

### Fonts
- **Display + Body**: `Geist` (Google Fonts) + `Geist Mono` for code

### Color Palette
```css
--bg-base:     #0c0c0c;
--bg-subtle:   #111111;
--bg-elevated: #1c1c1c;
--text-primary:   #efefef;
--text-secondary: #999999;
--text-tertiary:  #555555;
--text-disabled:  #333333;
--accent:        #4f7bf7;
--accent-hover:  #6690f9;
--accent-dim:    rgba(79,123,247,0.10);
--border-faint:  rgba(255,255,255,0.05);
--border-base:   rgba(255,255,255,0.11);
```

### CSS File
- `public/css/global.css` — ALL styles live here, single file

### Hover / Animation Rules (Day 2 added)
- Buttons: `translateY(-1px)` + slight brightness on hover
- Cards: border brightens from `--border-faint` to `--border-subtle`
- Navbar links: animated underline slide-in
- Pricing cards: border glow on hover (accent color, low opacity)
- NO bounce, NO neon glow, NO scale > 1.02

---

## 🏗️ Tech Stack

### Backend
- **Runtime**: Node.js v18
- **Framework**: Express.js
- **Templating**: EJS
- **Database**: MongoDB (via Mongoose) — runs via `mongod --dbpath ~/data/db` in separate terminal
- **Auth**: Passport.js (local strategy) + JWT for API
- **Payments**: Stripe (Checkout + Webhooks) — Phase 4

### Plugins
- **Figma Plugin**: TypeScript + Figma Plugin API — Phase 2
- **Roblox Plugin**: Luau + HttpService — Phase 3

---

## 📁 Folder Structure

```
bloxfig/              ← actual folder name on disk
├── CLAUDE.md
├── .env              ← created manually, never commit
├── .gitignore
├── package.json
├── server.js
├── config/
│   ├── db.js
│   ├── passport.js
│   └── stripe.js     ← Phase 4
├── models/
│   ├── User.js
│   ├── Project.js
│   └── Asset.js
├── routes/
│   ├── auth.js
│   ├── dashboard.js
│   ├── marketplace.js
│   ├── api.js
│   └── webhooks.js
├── middleware/
│   ├── isAuthenticated.js
│   └── isPro.js      ← Phase 4
├── views/
│   ├── layout/
│   │   ├── header.ejs   ← smart navbar (changes when logged in)
│   │   └── footer.ejs
│   ├── pages/
│   │   ├── index.ejs    ← landing page with pricing (3 tiers)
│   │   ├── login.ejs
│   │   ├── signup.ejs
│   │   ├── dashboard.ejs
│   │   ├── marketplace.ejs
│   │   └── 404.ejs
│   └── partials/
│       └── assetCard.ejs
├── public/
│   ├── css/
│   │   └── global.css
│   ├── js/
│   │   └── main.js      ← hover effects + micro-interactions
│   └── assets/
└── scripts/
    └── seed.js          ← Day 2: populates DB with fake assets
```

---

## 🗄️ Database Schema

### Users
```js
{ email, password_hash, stripe_customer_id,
  subscription_status: 'Free' | 'Pro' | 'Lifetime' }
```

### Projects
```js
{ owner (ref: User), name, figma_file_id, json_layout_data, timestamps }
```

### Assets
```js
{ name, description, price (cents), file_url, preview_url, category, isPro }
```

---

## 💰 Pricing Tiers (3 tiers — Day 2 updated)

| Tier | Price | Type | Key Feature |
|------|-------|------|-------------|
| Free | $0 | Forever | 3 projects, basic export |
| Pro | $12/mo | Subscription | Unlimited projects, priority sync |
| Pro Plus | $49 | One-time / Lifetime | Everything in Pro, forever |

- `subscription_status` values: `'Free'`, `'Pro'`, `'Lifetime'`
- Pro Plus sets status to `'Lifetime'`

---

## 🔌 API Endpoints

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| POST | `/api/export` | JWT | Figma → save Project |
| GET | `/api/import/:id` | JWT | Roblox → fetch Project |
| POST | `/api/token` | — | Login → get JWT |
| POST | `/api/webhooks/stripe` | Stripe sig | Payment → upgrade user |
| GET/POST | `/auth/login` | — | Session auth |
| GET/POST | `/auth/signup` | — | Session auth |
| GET | `/auth/logout` | Session | |
| GET | `/dashboard` | Session | Protected |
| GET | `/marketplace` | — | ?category= filter |

---

## 🤝 Smart Merge Logic (Phase 3)

1. Every Roblox element gets `SetAttribute("Figblox_ID", uuid)`
2. On re-import: diff by ID
3. Match → update Size/Position/Color only, never delete children
4. No match → create new element
5. Orphan IDs → flagged, not deleted

---

## 📅 30-Day Sprint Status

### Week 1: Foundation ✅ COMPLETE
- [x] Scaffold, server.js, package.json
- [x] MongoDB models + .env
- [x] Passport.js auth (signup/login/logout working)
- [x] JWT middleware + API routes
- [x] Landing page + all EJS views (Bloxig v2 Linear design)
- [x] MongoDB running via manual install (no Homebrew — macOS 10.15 + Xcode 6.4)

### Day 2: Polish & Data ✅ COMPLETE
- [x] Smart navbar — different links when logged in vs logged out
- [x] Hover animations — buttons lift, cards brighten, nav underlines
- [x] Pricing — 3 tiers (Free / Pro $12/mo / Pro Plus $49 lifetime)
- [x] Seed script — populates marketplace with real-looking assets
- [x] Tab title fix — "Bloxig" not "Figblox"
- [x] global.css animation additions

### Week 2: Logic Bridge (Days 8–14) ← NEXT
- [ ] Day 8–10 — Figma Plugin boilerplate + JSON console export
- [ ] Day 11–14 — POST /api/export + MongoDB save

### Week 3: Roblox Importer (Days 15–21)
- [ ] Day 15–17 — Luau plugin skeleton + HttpService fetch
- [ ] Day 18–21 — Generator.lua + SmartMerge.lua

### Week 4: Paywall & Polish (Days 22–30)
- [ ] Day 22–25 — Stripe Checkout + Webhook
- [ ] Day 26–28 — Final polish + BCA presentation mode
- [ ] Day 29–30 — Testing + Smart Merge bug hunt

---

## ⚙️ Environment Variables (.env)

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/bloxig
SESSION_SECRET=bloxig_super_secret_session_key_change_this
JWT_SECRET=bloxig_jwt_secret_key_change_this_too
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
NODE_ENV=development
```

## 🖥️ How to Run (every session)

```bash
# Terminal Tab 1 — MongoDB
~/mongodb-macos-x86_64-7.0.4/bin/mongod --dbpath ~/data/db

# Terminal Tab 2 — Server
cd Desktop/bloxfig
npm run dev

# To seed marketplace data (run once)
node scripts/seed.js
```

---

## 🚦 Current Session Notes

- **Last worked on**: Day 2 — navbar smart auth state, hover effects, 3-tier pricing, seed script
- **Next task**: Week 2 Day 8 — Figma Plugin boilerplate
- **Blockers**: Homebrew not available (macOS 10.15 + Xcode 6.4 too old). MongoDB runs manually.
- **Key decisions**:
  - Pro Plus = $49 one-time lifetime deal, sets `subscription_status: 'Lifetime'`
  - Navbar shows different links based on `user` session variable (already in res.locals)
  - Hover effects in `global.css` transitions only — no JS needed for basic hovers
  - Seed script lives in `scripts/seed.js`, run with `node scripts/seed.js`

---

*Read this file at the start of every session. Update "Current Session Notes" each time.*
