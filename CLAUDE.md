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
| **Folder on disk** | `~/Desktop/bloxig/` |
| **Live URL** | https://bloxig.onrender.com (Render free tier, Singapore) |
| **GitHub** | github.com/ethruz/bloxig (PRIVATE) |
| **Database** | MongoDB Atlas cloud (cluster0.yqbiygk.mongodb.net/bloxig) |
| **Payments** | Lemon Squeezy (merchant of record) — built + tested in TEST MODE |

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
- **Payments**: Lemon Squeezy (merchant of record) — built + test-mode verified. ⚠️ Nepal payout unresolved (see CURRENT STATE).

### Plugins
- **Figma Plugin**: TypeScript + Figma Plugin API — Phase 2
- **Roblox Plugin**: Luau + HttpService — Phase 3

---

## 📁 Folder Structure

```
bloxig/               ← folder name on disk
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
MONGODB_URI=mongodb+srv://...@cluster0.yqbiygk.mongodb.net/bloxig   # ONE LINE ONLY
SESSION_SECRET=...
JWT_SECRET=...
NODE_ENV=production
# Lemon Squeezy (replaced Stripe):
LEMON_API_KEY=...
LEMON_WEBHOOK_SECRET=...
LEMON_CHECKOUT_PRO=https://bloxig.lemonsqueezy.com/checkout/buy/0aac51bb-8667-43b1-83a8-eb0ab6387f90
LEMON_CHECKOUT_LIFETIME=https://bloxig.lemonsqueezy.com/checkout/buy/43b00e8d-e323-40bd-99c9-f6110953c690
# STRIPE_* vars are now DEAD (can delete from Render)
```
> Set in BOTH Render (Environment tab) and local `.env`. Atlas, not local mongod.

## 🖥️ How to Run (every session)

> ⚠️ OUTDATED — this described the old LOCAL mongod setup. Now the DB is
> **MongoDB Atlas (cloud)** and the app deploys to **Render**. For local dev you
> just need `npm run dev` with the Atlas `MONGODB_URI` in `.env` (no local mongod).
> To deploy: `git push && git push origin master:main` (see CURRENT STATE).

```bash
# Terminal Tab 1 — MongoDB
~/mongodb-macos-x86_64-7.0.4/bin/mongod --dbpath ~/data/db

# Terminal Tab 2 — Server
cd Desktop/bloxig
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


--- new updated files ---
## 💻 Hardware Setup

| Machine | Use |
|---------|-----|
| MacBook Pro 2012 (MacBookPro9,2) | Roblox Studio, Node.js server, MongoDB, VS Code, backend |
| Other laptop (newer) | Figma Desktop, plugin development, plugin testing, publishing |

**Mac limitations:**
- Max macOS: Catalina 10.15
- Figma Desktop not supported (dropped Catalina support)
- No plugin development on this machine
- Use browser Figma for design viewing only

**Figma Plugin workflow:**
- Develop + test on newer laptop only
- Publish updates from newer laptop
- Mac uses published version only

---

## 🔌 Plugin Architecture (v2.0 — CURRENT)

**Pipeline:** Figma plugin → POST /api/export → MongoDB → GET /api/import → Roblox plugin

**Status:** Pipeline fully working end to end. Quality issues being fixed.

### What was broken / now fixed:
- Positions/sizes wrong → ScaleConverter getReferenceSize() fixed
- Text scaling → lockText() now called correctly
- Wrong Roblox classes → Prefix system added in Generator.lua v3.0
- Images missing → Raster export added in code.ts v2.0

### Prefix system (v2.0):
| Prefix | Roblox Class |
|--------|-------------|
| .textbutton | TextButton |
| .imagebutton | ImageButton |
| .scrollv | ScrollingFrame (vertical) |
| .scrollh | ScrollingFrame (horizontal) |
| .canvas | CanvasGroup |
| .raster | ImageLabel (PNG baked) |
| .input | TextBox |
| .viewport | ViewportFrame |
| .ignore | skip node entirely |

### Raster image pipeline:
1. Figma plugin detects .raster layers + IMAGE fills + VECTOR nodes
2. exportAsync() each to PNG, convert to base64
3. Bundle into payload.images { imageName: base64 }
4. Server stores images (TODO)
5. Roblox fetches + uploads via Open Cloud API (TODO)
6. Generator.linkImages() wires rbxassetid:// to ImageLabels

### Files changed in v2.0:
- code.ts → prefix parser, raster detection, exportAsync pipeline
- code.js → compiled from code.ts
- Generator.lua → prefix dispatch system, linkImages() function

### Competitor research (Figblox):
- figblox.xyz — fully local, no server, ZIP export
- Has: .raster tags, auto-layout, prefix system, Link Images button,
  import preview, undo/redo, screen insets, layer panel
- Their image flow: raster to PNG in ZIP → manual upload to Roblox Asset Manager → Link Images button matches by name
- Your edge: server-based sync, SmartMerge, account system, SaaS model

---

# ============================================================
# 🟢 CURRENT STATE (most recent — supersedes older notes above)
# ============================================================

## 🎯 CORE EXPORT ENGINE — FIDELITY FIXES (this session, all verified)
The Figma→Roblox conversion had multiple correctness bugs. Fixed in order:

1. **Colors & gradients (code.ts).** Figma's Paint shape didn't match what the
   Lua read: SOLID alpha is in `paint.opacity` (not color.a), gradients give a
   `gradientTransform` MATRIX (not an angle). Added `normalizePaints()` in code.ts
   → emits SOLID `{r,g,b,a}` (opacity folded into alpha) and gradients with clean
   stops + `gradientAngle` (radians, computed via atan2 of the transform). Result:
   semi-transparent fills + gradient directions now correct.

2. **Positions / nesting — THE big one (code.ts).** Figma is inconsistent: FRAME
   children use parent-relative x/y, but GROUP children carry near-ABSOLUTE canvas
   coords. The Generator assumed all-relative → GROUP children divided by parent
   width → huge fractions → clamped → flew off-screen. Fix: serialiseNode now takes
   parent's absolute origin and computes x/y from `absoluteBoundingBox` minus parent
   origin → JSON is UNIFORMLY parent-relative (FRAME or GROUP). Verified: a GROUP's
   button that was x:343 (=parent x, broken) is now x:0 (correct).

3. **Text scaling — Option 3 (Generator + ScaleConverter).** Was: TextScaled=false
   + fixed px → text didn't scale with the responsive frame (80px stayed 80px on a
   shrunk UI). Now: TextScaled=true + UITextSizeConstraint(MaxTextSize=Figma px) →
   text fills its box, scales down on small screens, never exceeds design size. No
   runtime script. Fixed in ALL FOUR text paths (Generator create+update,
   ScaleConverter.lockText, SmartMerge) so the tool chain doesn't undo it.

4. **Clipping (code.ts + Generator).** code.ts never exported clipsContent → frames
   never clipped → decorative "rays" overlays (negative/overflowing/rotated children)
   spilled across the UI. Now code.ts exports clipsContent (frames default true), and
   Generator sets ClipsDescendants on Frame/ScrollingFrame/CanvasGroup. Overflow text
   like "Inventory" (x:777+329 in a 922 frame) is now contained.

5. **Auto-layout override — THE Shop-breaker (Generator).** Figma frames can carry
   `layoutMode:"GRID"` (Shop UI 2 root did). Generator's applyLayout() slapped a
   UIGridLayout on it, which IGNORES child Position and crams everything into fixed
   100×100 cells → scrambled layout. Fix: applyLayout() is now a NO-OP (returns
   immediately). Positions are authoritative; pixel-accurate Figma coords are used
   as-is. (Future: support auto-layout properly by applying UIListLayout ONLY for
   layoutMode frames AND skipping child positions for them — deliberate feature.)

6. **Stroke thickness scaling (Generator).** strokeWeight was raw px → borders looked
   chunky/inconsistent when the UI scaled. Fix: applyStroke(inst, node, frameW) scales
   thickness = (rawWeight/frameW)*1280 (STROKE_REF_WIDTH), min 0.5 — borders keep their
   Figma proportion across screen sizes.

**RESULT (verified in Studio):** Shop UI 2 + Quest Frame now import faithfully —
correct positions, nesting, text sizing, clipping — and scale cleanly across devices
(iPad, iPhone, desktop res). Compared side-by-side to Figma originals: faithful.

**Files changed:** figma-plugin/code.ts (+code.js compiled), roblox-plugin
Generator.lua, ScaleConverter.lua, SmartMerge.lua.

## 🖼️ IMAGE AUTO-UPLOAD — BUILT + ARCHITECTURE CORRECTED (this session)
Images now export AND auto-upload to Roblox. Key differentiator vs Figblox (they
require manual upload every time; Bloxig auto-uploads). Closes the blank-textures gap.

**⚠️ ARCHITECTURE CHANGED MID-SESSION — READ THIS:**
First attempt had the Roblox PLUGIN call Open Cloud directly. THAT FAILED in live test:
`HttpService is not allowed to access that Roblox resource`. Roblox HARD-BLOCKS plugins
from calling apis.roblox.com (only a few whitelisted Open Cloud endpoints work, only
from game servers — NOT the Assets endpoint, NOT from plugins). Confirmed via Roblox's
2025 announcement. So the upload was MOVED TO THE SERVER:
  - Plugin POSTs { images, apiKey, userId } to OUR server (/api/upload-images)
  - The SERVER (Node, no restriction) does the Open Cloud multipart upload + polling
  - Server returns { imageName: "rbxassetid://id" }; plugin links by name.
This is the CURRENT, working architecture. Do NOT move the upload back into the plugin.

**Pipeline (imageName is the matching key through all stages):**
1. code.ts `imageNameFor()` assigns stable unique name = `{cleanName}_{nodeId}` for
   nodes with an IMAGE fill or `.raster` tag (vectors NOT auto-rasterised — would bloat).
2. code.ts `collectImages()` renders each via exportAsync (PNG, 2x) → base64 →
   `payload.images = { imageName: base64 }`.
3. Server stores it (inside json_layout_data; api.js has a 14MB guard).
4. Generator sets `Figblox_ImageName` attribute on each ImageLabel.
5. Plugin's ImageUploader.lua (now a THIN CLIENT) POSTs images+apiKey+userId to
   /api/upload-images. routes/imageUpload.js does the actual Open Cloud upload
   (multipart via Node global fetch/FormData/Blob), polls the operation, returns
   { imageName: "rbxassetid://id" }.
6. Generator.linkImages(container, map) matches Figblox_ImageName → map → sets inst.Image.

**Files (all delivered + validated):**
- code.ts/code.js v1.4.0 — imageNameFor, collectImages, base64-bundled images.
- api.js — 14MB payload size guard (returns 413 payload_too_large).
- routes/imageUpload.js — NEW SERVER ROUTE; does the real Open Cloud upload. Node 18
  has global fetch/FormData/Blob (no new deps). Mounted in server.js as
  `app.use('/api', require('./routes/imageUpload'))` AFTER express.json.
- ImageUploader.lua v2.0 — REWRITTEN as a thin server-client (was a full Open Cloud
  uploader; that version can't work due to the HttpService block). Now just calls our
  server. Lives in roblox-plugin/src/ alongside Generator/SmartMerge/ScaleConverter.
- Main.lua v2.2.0 — "Image Sync" fields (API key + user ID, stored locally via
  SetSetting) + upload+link step in confirm handler. SERVER_URL = bloxig.onrender.com.
- server.js — express.json limit raised 10mb → 50mb (image payloads); imageUpload route
  mounted.

**LIVE TEST RESULTS (this session):**
- ✅ Architecture works: request now flows plugin → our server → Open Cloud. The old
  "HttpService not allowed" error is GONE.
- ❌ Last blocker = API KEY CONFIG (Roblox returns 401: "API key rejected"). This is a
  DASHBOARD setup issue, not code. The key needs, at create.roblox.com/credentials:
  (1) Assets API system ADDED with BOTH Read + Write, (2) NO IP restriction (or
  0.0.0.0/0) — because requests now come from RENDER's IP, not the user's machine; an
  IP restriction tied to home IP will reject, (3) userId must match the key's account.
  → User was fixing the key when session paused. Once key is correct, re-test.

**STILL UNVERIFIED (after key is fixed):**
- Decal→Image resolution: Open Cloud upload returns a DECAL id, not an Image id.
  imageUpload.js currently returns rbxassetid://<assetId> directly. If images upload OK
  (no errors) but show BLANK, the decal-vs-image id is the cause — add resolution
  (InsertService in-plugin, or fetch the image id) at that point.
- Moderation timing (poller waits ~22s/image; slow moderation may report fail but
  approve later).

**STORAGE NOTE (do before scaling, NOT before testing):** base64 images are stored
inline in json_layout_data → eats Atlas free tier (512MB ≈ ~250 image-heavy projects).
Once upload works, strip/clear the base64 from the stored doc after upload (the asset
lives on Roblox after that; only the rbxassetid is needed), OR move images to a separate
TTL collection that auto-expires. Fine inline for testing + early users.

**HOW THE USER USES IT:** fill API Key + Roblox User ID once → Preview → Confirm →
images auto-upload + link. API key: create.roblox.com/credentials → add Assets system →
Read+Write → no IP restriction → copy key. User ID from roblox.com/users/<ID>/profile.

**FUTURE (deferred, foundation reused):** gate auto-sync as an "Advanced" tier when
more users; keyless Figma-ZIP manual fallback; OAuth one-click "Connect Roblox".

## 🔐 PRODUCTION-READINESS — REALISTIC TRIAGE (not a single must-do list)
A long enterprise checklist exists (injection, RBAC, TLS cert rotation, multi-tenancy,
chaos engineering, RPO/DR, audit trails, ADRs, etc.). Most of it is SCALE/ENTERPRISE/
funding-diligence, NOT pre-launch. Triage for a solo pre-revenue founder:

ALREADY HAVE: HTTPS/TLS (Render), auth (Passport+JWT), secrets in env vars, rate
limiting (server.js), ownership-check authorization, session+JWT expiry.

DO SOON (cheap, real risk): (1) input validation/sanitization on /api/export + auth;
(2) `npm audit fix` for dependency vulns; (3) confirm no secrets in the GitHub repo;
(4) ROTATE the JWT that was pasted in chat during debugging; (5) basic "delete my
account+data" path + keep privacy policy current; (6) ensure no stack traces leak to
users.

LATER (scale/enterprise, NOT now): chaos engineering, circuit breakers, DR/RPO/RTO,
multi-tenancy isolation (already per-user), audit trails/tamper-evidence, stress
testing, ADRs, coverage thresholds, retry/backoff, cache invalidation strategy.

GUIDANCE: do NOT build the whole list now — it freezes shipping. Finish the product
(images), do the cheap security wins (~1 day), get real users, revisit heavy items as
you grow / as investors ask.



## 🚀 Deployment (LIVE)
- **Hosting:** Render free tier, Singapore, service id `srv-d84pr78jo89c73b1ppjg`
- **Live site:** https://bloxig.onrender.com
- **⚠️ BRANCH GOTCHA:** local work is on `master`, Render deploys `main`.
  EVERY push needs TWO commands (no inline `#` comments — zsh errors):
  ```bash
  git push
  git push origin master:main
  ```
- Render only serves last SUCCESSFUL deploy (crashes keep old code live).
- Free tier cold-starts ~50s. Hard-refresh Cmd+Shift+R after deploy.
- **DB:** MongoDB Atlas. `MONGODB_URI` must be ONE line (line-break splits
  password → `bad auth`). Atlas Network Access = 0.0.0.0/0. Password ROTATED
  after a leak (done). User = ethicalhunter92_db_user.

## ✅ FEATURES BUILT & DEPLOYED (all live + tested)
- **Plugin pipeline:** Figma → POST /api/export → Atlas → GET /api/import → Roblox.
  Per-frame project identity (figma_frame_id required). Free tier caps at 3
  projects → "limit reached". Plugin code.js recompiled (has figma_frame_id line 221).
- **Profile system:** avatar picker (12 DiceBear presets, "style:seed:bg" string,
  avatarUrl virtual), editable username w/ 30-day cooldown (usernameChangedAt) +
  uniqueness, inline messages (not flash). Emoji purged from UI.
- **Voucher system:** /profile/redeem page. Codes: BLOXIG2026=Pro/30d,
  BCALAUNCH=Pro/90d, LIFETIME50=Lifetime. One voucher per account (voucherUsed).
- **Voucher EXPIRY:** proExpiresAt field; set on redeem by durationDays; checked
  in passport.js deserializeUser on EVERY request → auto-downgrades expired Pro→Free.
  Lifetime never expires. Billing tab shows "X days remaining" (gold when ≤7).
  NOTE: user's own account redeemed BEFORE this → proExpiresAt=null = no expiry
  (grandfathered, shows "Active · no expiry").
- **Project delete:** trash icon on each card → custom dark modal (NOT native
  confirm) → POST /dashboard/projects/:id/delete with ownership check
  (findOneAndDelete {_id, owner}).
- **PAYMENTS (Lemon Squeezy)** — built, wired, TESTED in test mode (see below).

## 💳 LEMON SQUEEZY PAYMENTS (built + test-mode verified, NOT live)
- **Products:** Pro ($12/mo sub, id 1163128, checkout UUID
  0aac51bb-8667-43b1-83a8-eb0ab6387f90); Pro Plus ($49 one-time lifetime, id
  1163156, checkout UUID 43b00e8d-e323-40bd-99c9-f6110953c690).
- **Env vars (Render + local .env):** LEMON_API_KEY, LEMON_WEBHOOK_SECRET,
  LEMON_CHECKOUT_PRO, LEMON_CHECKOUT_LIFETIME. (Old STRIPE_* vars now dead.)
- **Webhook:** https://bloxig.onrender.com/api/webhooks/lemon (test mode).
  Events subscribed: order_created, subscription_created, subscription_updated,
  subscription_cancelled, subscription_expired, subscription_payment_success.
  (User chose NO pause/refund events — no pause feature wanted.)
- **routes/webhooks.js:** REPLACED the old Stripe stub. HMAC-SHA256 signature
  verify via LEMON_WEBHOOK_SECRET (needs RAW body — server.js mounts
  express.raw on /api/webhooks BEFORE express.json, already correct).
  Maps events → plan. Claude-style cancel = stay Pro until expired.
  Pro→Lifetime auto-cancels old monthly sub via LS API DELETE call.
- **server.js:** /checkout/pro & /checkout/lifetime redirect to LS checkout with
  ?checkout[email]=...&checkout[custom][user_id]=... so webhook matches the buyer.
- **User.js additions:** lemon_portal_url, subscription_ends_at, proExpiresAt.
- **profile.ejs:** "Manage subscription" button → LS portal (Pro users).
- **index.ejs:** PLAN-AWARE pricing buttons — Free user sees Upgrade/Get;
  Pro user sees "Current plan" (disabled) on Pro + "Upgrade to Lifetime";
  Lifetime sees all disabled. Logged-out → signup. "Get Pro" (NO free trial —
  Free tier IS the trial).
- **TESTED LIVE (test mode):** completed Pro Plus checkout w/ card 4242 4242 4242 4242
  → webhook fired → account became Lifetime → profile shows "Lifetime · forever"
  → LS recorded $49 order + receipt emails sent. FULL CHAIN CONFIRMED WORKING.

## 🔴 CRITICAL BLOCKER — PAYOUT TO NEPAL (unresolved)
- User is in **NEPAL**. This is the one thing stopping going live.
- **Lemon Squeezy = DEAD END for Nepal payout:** LS offers only Bank (79
  countries, excl. Nepal) or PayPal. Nepal bank = "Not available in your country."
  PayPal CANNOT receive/withdraw in Nepal (NRB restriction — confirmed via research).
  LS does NOT support Payoneer (open feature request, unbuilt).
- **User assets:** (1) verified **Payoneer** account, (2) **friend in Australia**.
- **Options researched:**
  1. **Dodo Payments** (India-based MoR, 4%+40¢ ~5.5-6% effective, $5 payout fee
     if <$1000, fast Discord support, South-Asia oriented). Nepal IS on their
     payment-ACCEPTANCE list (NP #155) — but that's where customers pay FROM, NOT
     payout. Payout is "optimized for Indian banks"; one source says "no direct
     bank transfers yet for certain countries." **WHETHER DODO PAYS OUT TO NEPAL
     IS STILL UNCONFIRMED — must ask support@dodopayments.com / Discord directly.**
  2. **Australia-friend route** — friend receives on LS/any processor (AU = full
     PayPal/bank). Works, but it's their name/account/tax. Best w/ close family.
  3. **Paddle** (5%+50¢, supports Payoneer, but stricter approval — often rejects
     $0/early sellers). FastSpring = enterprise overkill.
- **NEXT ACTION on payout:** user to ask Dodo support if they pay out to Nepal.
  If yes → rebuild integration for Dodo (swap LS checkout+webhook; app is portable).
  If no → Australia-friend route, or Paddle.
- **Store still in TEST MODE** — do NOT activate / take real money until payout solved.
  Activation needs personal+bank details (NOT business registration — individual is
  fine; MoR handles all sales tax/VAT). Nepal income tax = "once earning" concern
  (maybe get a PAN), handled w/ local accountant. No company needed to start.

## ⏳ LAST UNBUILT FEATURE
- **Forgot-password flow.** /auth/forgot link on login still 404s. Needs: Gmail
  SMTP + Nodemailer (free, user generates Gmail app password), resetToken+resetExpires
  on User, 4 routes (forgot form → email link → reset form → save), 2 EJS pages.
  Processor-agnostic — can build anytime regardless of payout decision.

## 📁 KEY FILES (latest versions delivered this session)
- routes/webhooks.js (LS handler, replaced Stripe), server.js (checkout redirects),
  models/User.js (lemon fields + proExpiresAt), config/passport.js (expiry check),
  routes/profile.js (voucher expiry), routes/dashboard.js (delete route),
  views/pages/index.ejs (plan-aware pricing), views/pages/profile.ejs (manage sub +
  days remaining), views/pages/dashboard.ejs (delete modal).

## 🚦 NEXT STEPS (priority order)
1. **FIX API KEY + re-test image upload.** Architecture works (plugin→server→Open Cloud
   confirmed live; old HttpService block GONE). Last blocker = Roblox returns 401 "API
   key rejected". Fix at create.roblox.com/credentials: add Assets system w/ Read+Write,
   NO IP restriction (requests come from Render's IP now, not user's machine), userId
   must match the key's account. Then re-import Shop UI, watch Output. If uploads succeed
   but images show BLANK → it's the Decal→Image id resolution (add it in imageUpload.js).
2. **Strip inline base64 images after upload** — before scaling. Eats Atlas free tier
   (512MB) otherwise. Once upload confirmed, clear images from stored doc post-upload.
3. **Cheap security pass** (~1 day) — npm audit fix, input validation on /api/export
   + auth, confirm no repo secrets, rotate the exposed JWT, no stack-trace leaks.
4. **Resolve Nepal payout** — ask Dodo support re: Nepal payout. Decide processor.
5. **Build forgot-password** — last non-core feature (Resend HTTPS, not Gmail SMTP).
6. When payout solved → activate LS store (or switch to Dodo) → go live.
7. (Optional) set Render branch to master to end two-branch pain (user declined so far).

## ✅ CORE EXPORT ENGINE — STATUS: COMPLETE (pending image live-test)
After this session the export covers the FULL fidelity chain: positions, nesting,
colors, gradients, text scaling, clipping, strokes, AND images (auto-uploaded). Shop
UI 2 + Quest Frame verified faithful + scaling across devices. The product is
demoable. Remaining = live-test images, then security pass + payout to go live.

## 📝 NOTE ON FORGOT-PASSWORD (paused mid-build)
Built the flow (4 routes, 2 EJS pages, resetToken/resetExpires on User). Gmail SMTP
FAILED — Render free tier blocks outbound SMTP (Connection timeout). Switched mailer
to Resend (HTTPS API, port 443). Needs RESEND_API_KEY + RESEND_FROM env vars and the
user to finish testing. Currently SKIPPED to focus on core export quality.

---

*Read this file at the start of every session. The 🟢 CURRENT STATE section is
authoritative; sections above it are older history kept for reference.*
