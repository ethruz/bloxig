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

## 🟢🟢🟢 SESSION 2026-07-07b — STRUCTURE-BASED DETECTION (name-independent) SHIPPED (NEWEST, supersedes all below)

**THE UPGRADE: detection no longer depends on layer NAMES.** Earlier today the AI
wiring worked but detection was name-matching (fragile — Battle Pass = only 1
element found). Now it detects interactive elements by STRUCTURE + POSITION + TEXT,
so it works on ANY design regardless of naming. Battle Pass went **1 → 4 detected.**

### Why we did it (the insight)
User's own realization: name-matching is a whitelist, not automation. A user who
names a button "Btn_Dismiss" / "collectReward" / "Group 47" / non-English falls
through. Real fix: detect by what an element IS (shape/fill/text/position), let the
AI infer role. VALIDATED by prior art research this session:
- **Locofy** (Figma→code startup): their "Classic" needed manual tagging (our pain);
  "Lightning" automated it. CTO: LLM exposure <5% — heuristics for structure, LLM
  only for light semantic tasks. EXACTLY our Heuristic-Filter → LLM-Classifier split.
- **Alibaba UISCGD** (paper): semantic UI grouping (cards/lists/tabs) from view
  hierarchy WITHOUT manual annotation. Peer-reviewed proof structure-detection works.
- **Our moat clarified:** the technique is known; NOBODY does it for Roblox/Luau.
  Edge = underserved platform, not novel AI. Strong hackathon pitch framing.
- Collaboration model established: Claude + web research + Gemini (2nd architecture
  opinion) + user (ground truth). Gemini gave the 3-gate rule, tab-row + dedup algos.

### What shipped (structure detection)
1. **`code.ts` v1.5.1 — detection pass** (`detectInteractivity` + helpers), runs on
   the Figma node (true pixel geometry, no Roblox edit-mode-zero problem):
   - **`isButtonCandidateByStructure`**: 3-gate rule (Gemini's design) —
     Gate 1 visual backing (fill/stroke OR **rasterized image** on node or shallow
     descendant), Gate 2 has-text-but-not-a-2+-card-grid, Gate 3 size/aspect sanity
     + >90000px² banner guardrail (so headers aren't buttons).
   - **`detectRowMembership`**: evenly-spaced sibling row = tabs (uniform gap < width),
     distinguished from spread-out card grids.
   - **`inferRoleHint`**: first-guess role from text + position zone (top-right sq = close).
   - Stamps `interactive`/`roleHint`/`uiContext{text,zoneX,zoneY,aspect,rowMember}` on node.
   - Name signals kept only as a WEAK booster (nameSignal || structSignal), never the gate.
2. **TWO bugs found + fixed via curl-JSON diagnostics** (didn't guess — read the data):
   - Figma GROUPS are transparent (fill is on a child rect) → Gate 1 now checks
     DESCENDANTS (`backingWithin`), not just the node.
   - **Auto-rasterized buttons** (e.g. Exit = baked red hexagon PNG, empty fills,
     isRaster=true): (a) Gate 1 now treats `isRaster`/`imageName` as visual backing;
     (b) `serialiseNode` returned early on raster nodes BEFORE detection ran — moved
     `detectInteractivity` INTO the rasterize branch. This makes ANY baked button
     wireable (common — fancy game buttons get rasterized).
3. **`Generator.lua` — HYBRID `collectInteractive`** (3 sources, dedup'd via `seen`):
   (1) STRUCTURAL: reads `Bloxig_Interactive`/`Bloxig_RoleHint`/`Bloxig_Ctx*` attrs
   stamped in `injectIdentity` from the Figma detection → overlays transparent
   TextButton, passes role+context. (2) real Roblox buttons/inputs. (3) FALLBACK:
   loose visible elements whose name looks interactive (for loose-text tabs/claims
   the Figma side skips). Unique names for dupes.
4. **`aiWire.js` — context-aware prompt**: sends each element's text + position zone
   + row-membership; tells Kimi to REFINE the role from context (top-right "x" = close,
   same-size row = tabs). Kimi reasons about structure, not names.

### VERIFIED (Battle Pass, iPhone XR preview)
`Auto-detected 4 interactive element(s)` → `AI interaction script attached (4 elements)`.
Explorer shows ExitClick / GetPremiumClick / TierClick overlays auto-created.
- ✅ Exit (structural, rasterized close button — the hard case, works)
- ✅ GetPremium (structural button)
- ⚠️ Tier — MARGINAL false positive (a label caught by the `tier` name-fallback).
  Harmless (invisible no-op overlay) but not a real button. Trade-off of wider net;
  can tighten later. Not a blocker.

### STILL OPEN / NEXT
- Tighten fallback to reduce label false-positives (e.g. Tier) — low priority.
- Tab CONTENT-switching + scroll = still ROADMAP (detection makes tabs clickable;
  actual content-swap not built).
- Hover/animations = ROADMAP.
- Model still `kimi-k2p6` (Gemma not serverless on this account). Fine for Unicorn track.

### DELIVERABLES (Unicorn track — deadline July 11, still TODO)
Auto-screener reads repo + slide deck (PDF) + hosted URL for AMD usage (or DISQUALIFIED).
- [ ] Clean PUBLIC demo repo (AMD/Fireworks/Kimi code visible; prod repo stays private)
- [ ] Slide deck (PDF) w/ explicit AMD-usage slide + the Locofy/Alibaba "validated approach" framing
- [ ] Demo video (Quests hero + now Battle Pass generalization)
- [ ] Hosted URL = live Render app w/ real Kimi

### FILE STATE (all in /outputs, compiled + verified)
- `code.ts` / `code.js` v1.5.1 (Claude compiled the .js — user doesn't need to; just replace both)
- `Generator.lua` (hybrid detection, luac-checked)
- `aiWire.js` (context prompt)
- Figma plugin gotcha: editing code.ts needs recompile; Figma CACHES code.js — must
  fully quit/reopen Figma to load a new build. Version string is the proof it loaded.

---

## 🟢🟢🟢 SESSION 2026-07-07 — AI INTERACTION LAYER SHIPPED + LIVE (supersedes all below)

**THE BIG ONE: Bloxig now makes converted UIs WORK, not just look right.** The AI
interaction layer is built, deployed, and demonstrated end-to-end. This is the
AMD Hackathon (ACT II, Unicorn track) feature. Deadline: **July 11**.

### What shipped (all live + verified in Studio)
1. **Backend route `routes/aiWire.js`** (POST /api/ai/wire) — takes the converted UI's
   interactive elements, calls an LLM on **Fireworks (AMD-hosted)**, returns Luau. API
   key stays server-side (`FIREWORKS_API_KEY` in Render env). Has a `USE_STUB` flag
   (currently FALSE = live AI). Mounted in server.js at `app.use('/', aiWireRoutes)`.
2. **Model = `accounts/fireworks/models/kimi-k2p6`** (Kimi K2.6). NOT Gemma —
   Gemma 4 is NOT serverless-callable on this Fireworks account (only Tunable /
   deploy-on-demand), so it 404s. Kimi/GLM/GPT-OSS/DeepSeek ARE serverless. Kimi K2.6
   is strong at code, so it's the better pick for Luau anyway. (Gemma bonus = $6k, but
   not worth deploy-on-demand hassle mid-sprint; Unicorn track only needs AMD compute,
   which Fireworks satisfies regardless of model.)
3. **`Generator.lua` — auto-detect + promote** (the Bloxig-way, no Figma tagging):
   `collectInteractive` walks the built tree, finds elements whose NAME looks interactive
   (INTERACTIVE_PATTERNS list), and for non-button visible elements (TextLabel/Frame/
   ImageLabel) it OVERLAYS a transparent full-size clickable TextButton (visuals
   untouched). Unique names for dupes (3× Claim → ClaimClick/ClaimClick2/ClaimClick3).
   Each gets a `hint` (close/claim/tab/generic) from its name. `Generator.attachAIWiring`
   is PUBLIC and inserts the returned Luau as a `BloxigInteractions` LocalScript.
4. **`Main.lua` — STEP 5 wiring call.** CRITICAL FIX: the import path is
   `SmartMerge.apply → linkImages → runToolChain`, it NEVER calls `Generator.buildFromJSON`.
   So the wiring call had to go in Main.lua AFTER runToolChain (line ~455), calling
   `Generator.attachAIWiring(rootFrame)` on the actual root FRAME (so close-button's
   `root.Visible=false` targets the panel, not the ScreenGui).

### VERIFIED WORKING (Quest UI)
Import → `Auto-detected 5 interactive element(s)` → `AI interaction script attached`.
In Play: clicking Claim → "Claimed!" on the label + reward-hook print; clicking X → panel
closes. Full pipeline: Figma → auto-convert → AI-wire → clickable. **DONE.**

### KNOWN GOTCHAS (hard-won this session)
- **Plugin update loop:** editing the ModuleScript TABS in Studio does NOT update the
  running plugin. Must right-click `ServerStorage → Bloxig` → **Save as Local Plugin**
  (overwrite Bloxig.rbxmx) for edits to take effect. This wasted ~1hr ("same result").
- **Plugin vanished** from toolbar after messy saves + duplicate .rbxmx files. Fix:
  delete ALL Bloxig*.rbxmx, save cleanly from the Bloxig folder, quit+reopen Studio.
- **Black-text bug:** Kimi was setting "Claimed!" on the transparent overlay (default
  black text). FIXED in aiWire.js prompt: feedback MUST target `btn.Parent` (the styled
  label), NEVER the overlay's own .Text. (Push aiWire.js for this to go live.)
- Git: `git push && git push origin master:main --force-with-lease` (main = Render).

### OPEN / NEXT (Battle Pass test revealed the gap)
- **Detection net too narrow.** Battle Pass UI has Tiers/Level1-5/Exit/GetPremium buttons
  but only 1 was detected — because those names don't match INTERACTIVE_PATTERNS
  (no "button/claim/close/tab" keyword). Widen the list (exit, premium, level, tier,
  equip, unlock, purchase, slot...) OR detect Group/Frame-with-text-label as button.
- **Tab switching + scrolling NOT built** (Battle Pass tabs, tier grid scroll). Genuinely
  complex → ROADMAP item, not pre-deadline. Talking point: "next: AI-generated scroll,
  tab switching, hover animations."
- **Getting Battle Pass JSON** to diagnose exactly what the export captured vs dropped.

### DELIVERABLES STILL TODO (Unicorn track — what's actually judged)
Auto-screener inspects **GitHub repo + slide deck (PDF) + hosted URL** for AMD usage
(NOT the video). AMD usage = hard requirement or DISQUALIFIED. Then human judges.
- [ ] Clean PUBLIC demo repo (AMD/Fireworks/Kimi code VISIBLE) — keep prod repo private
- [ ] Slide deck (PDF) with an explicit "runs on AMD via Fireworks" slide
- [ ] Demo video (Quests hero: convert → click Claim → click X)
- [ ] Hosted URL = live Render app running real Kimi (USE_STUB=false)

### HACKATHON FACTS
- AMD Developer Hackathon ACT II (lablab.ai). Submit by **July 11, 15:00 UTC**.
- Track 3 Unicorn: repo + video + deck (+ optional hosted URL). No Docker for Track 3.
- Credits: $50 Fireworks hackathon credit REDEEMED + active ($50 balance confirmed).
  Separate $100 AMD Cloud + $50 Fireworks new-member credit still on 2–3 day approval.
- Also registered: HTB Cyber Apocalypse CTF (July 24–29, team up to 30, bringing a friend).
- CC cert (ISC2) deadline July 31.

---

## 🟢🟢🟢 SESSION 2026-07-06 — QUEST FRAME DEMO-PREP: STROKES + CLAIM-BUTTON FINDING (supersedes all below)

Read the live Quest Frame export JSON to validate it as the hackathon HERO demo UI.
This was a fidelity/wireability AUDIT of the JSON — two definitive findings, one queued
Figma action. NO code change shipped this session.

### 1. Black strokes = NOT A BUG (do not "fix")
Almost every node showed `STROKE=rgb(0,0,0) a=1` → these are GENUINE full-opacity black
outlines in the design (deliberate bold/comic art style), NOT a conversion error. The
purple progress bars (`rgb(121,68,142)`) and blue outer frame (`rgb(52,174,253)`) render
their true colors too. **Stroke conversion is working correctly → leave black strokes
alone; "fixing" them would make the export LESS faithful to the design.**
- NOTE: this is SEPARATE from the 07-05 stroke-ALPHA fix. That fix was for TRANSLUCENT
  strokes being flattened to opaque black (`a: colorA * opacity`). Here the strokes are
  genuinely opaque black BY DESIGN — nothing to fix.

### 2. Claim buttons are LOOSE TEXT, not button objects (the real finding)
Each "Claim" is a bare `TEXT` node sitting BESIDE `Rectangle 10` (the button art) as
separate SIBLINGS — NOT wrapped in its own frame. So there is no clean per-quest
"ClaimButton" object. Only ONE node got the `[imagebutton]` prefix: the
`button <FRAME> [imagebutton]` at the bottom (the X / close button), because it IS a
properly-named button frame.
- ✅ **X / close button** → clean `[imagebutton]`. AI can wire "click X → close window" NOW.
- ⚠️ **Claim buttons** → wireable but MESSY (attach click to the loose Claim text or its
  rectangle). No clean object per quest → not demo-crisp as-is.

### 3. ACTION ITEM (queued — Figma-side, ~15 min, NOT a code change)
Cleanest fix is DESIGN-side: in Figma, wrap each Claim (text + its rectangle) in a FRAME
named `ClaimButton` (or add `.imagebutton` to the name) → re-export → each becomes a proper
`ImageButton` → confirm in the Explorer. Then the AI wires them cleanly.
- Alternative (no Figma edit): AI-side click handler on the Claim text/parent. Works,
  slightly less clean, no re-export needed.
- **Demo once wrapped:** open → 3 named quests shown → click Claim → "Claimed!" + coin
  reaction → click X → window closes. No ScrollingFrame needed (3 quests, fixed frame).
  X close is guaranteed-clean already; wrapping the Claims makes the whole Quest UI a
  fully-wireable demo HERO.

---

## 🟢🟢🟢 SESSION 2026-07-05→06 — SECURITY AUDIT + BASE64 SPLIT + EXPORT FIDELITY (gradient strokes, decor-pile, buttons FIXED) (supersedes all below)

### 1. FULL SECURITY AUDIT — done + fixes verified LIVE
Ran a complete black-box + code-review audit (IDOR, auth, JWT forgery, method-swap,
query/header injection, mass assignment, function-level, NoSQL, path traversal). Result:
**strong posture, ZERO critical/high.** Two mediums fixed + verified in production:
- **CSRF fix:** session cookie was `sameSite:'none'` in prod (sent cross-site) with NO CSRF
  tokens → CSRF on the session web routes (delete/profile). Fix = `sameSite:'lax'` in
  server.js. **CONFIRMED LIVE** via curl (`set-cookie ... SameSite=Lax`). Plugins use JWT
  (Authorization header), not the cookie, so nothing broke.
- **Session-secret fail-fast:** removed the hardcoded `'fallback_secret_change_this'`; now
  throws in prod if `SESSION_SECRET` unset. (App boots fine → env var IS set.)
- **`x-powered-by` disabled** (`app.disable('x-powered-by')`) — confirmed gone (was leaking
  on the CORS preflight where helmet couldn't reach). CORS `origin:'*'` CONFIRMED SAFE (no
  `credentials:true`, JWT can't be forced cross-site → nothing fetchable).
- **`npm audit`: 0 vulnerabilities** (was 1 moderate `qs`, fixed).
- **Verified clean via live tests:** cross-account IDOR on `/api/import/:id` → 404;
  no-auth → 401; `alg:none` + wrong-secret JWT → 403 (middleware verifies sig + pins algo,
  the LiteLLM-class bug is NOT present); mass assignment (owner/_id/plan in body) → ignored;
  path traversal → 400; admin/debug endpoints → 404.
- **STILL TODO (housekeeping):** regenerate the JWTs pasted in chat during testing (profile
  → Regenerate token). Low-priority hardening deferred: NoSQL `typeof` guards on /token,
  login timing side-channel, free-tier export race.

### 2. BASE64 SPLIT — shipped + VERIFIED (fixes storage bloat / 16MB doc risk)
Base64 images were ~99% of `json_layout_data` (measured: 5.3MB images vs 24KB layout).
Split them into a new **`ProjectImages` collection** (`{project, images}`), keyed by project.
- `models/ProjectImages.js` (NEW).
- `routes/api.js` — export strips `json_layout_data.images` → slim layout stored, images
  upserted to ProjectImages. Import re-attaches images before returning (plugin sees
  IDENTICAL data). **Backward-compat:** old inline projects (layout.images present) skip the
  lookup and return as-is. New projects re-attach from ProjectImages.
- **VERIFIED:** re-exported a design → import returns `images present: True | size: 5268925`.
  Layout doc now tiny → faster dashboard/import reads, no 16MB-per-doc risk.
- NOTE: does NOT reduce total storage (that needs the full strip + plugin change to reuse
  saved rbxassetids — deferred to a coordinated plugin release). This split is the safe,
  no-plugin-change win.
- **Delete cleanup:** `routes/dashboard.js` deletes the ProjectImages doc when a project is
  deleted (prevents orphans).

### 3. DELETE BUG FIXED (dashboard.js) + on-brand toasts
- **Bug:** `dashboard.js` called `ProjectImages.deleteOne()` but never imported the model →
  `ReferenceError` AFTER the project was already deleted → returned "Failed to delete" while
  the delete actually succeeded (hence "works after refresh"). **Fix = add the missing
  `require('../models/ProjectImages')`.** (Same missing-import class as the earlier line-7
  crash — always pair `Model.x()` with a require.)
- **UI polish:** `views/pages/dashboard.ejs` — replaced the two native `alert()` fallbacks
  (ugly grey browser boxes) with an on-brand **toast** system (dark, accent-bordered, auto-
  dismiss). Delete success → green toast + card fade; error → red toast, modal closes.
  Token-reveal error also uses a toast now. `window.showToast` exposed for reuse.

### 4. EXPORT FIDELITY FIXES (from Gemini's code-review of CLAUDE.md)
**#1 Auto-grid sibling-swallowing — FIXED (supersedes 07-04 "KNOWN TUNING #1").**
`looksLikeGrid` (code.ts) now counts non-card siblings and only tags a **PURE** grid
(2+ uniform cards AND `otherChildren === 0`). Mixed containers (cards + Description panel +
close button) are NO LONGER gridded → everyone keeps absolute positions (accurate to Figma).
**VERIFIED:** the Anime UI Description panel now sits correctly beside the grid instead of
being sucked into the flow. Power users can still force a grid by naming a dedicated
card-only frame `.scrollv`.

**Stroke alpha bug — FIXED.** `normalizePaint` SOLID branch used `a: opacity` and DROPPED
`color.a` (the gradient branch already multiplied both). Translucent glassmorphism strokes
were flattened to fully-opaque → hard BLACK borders. Fix = `a: colorA * opacity` (matches
gradient branch). **VERIFIED:** card borders now render soft/translucent. NOTE: this also
correctly affects translucent FILLS (they'll show proper transparency now).

**Both fixes are in ONE `code.ts`** (grid fix `otherChildren` + stroke fix `colorA`).
Compile `code.ts`→`code.js` (`cd figma-plugin && npx tsc`), copy `code.js` to Windows, reload.

### 5. TWO ISSUES FROM MID-SESSION — NOW FIXED + VERIFIED (completed later same session, into 07-06)
> These were logged as "NOT YET DONE" mid-session, then FIXED before the session ended.
> Updated 07-06: both shipped and verified across 5–6 real designs.

**(a) Gradient strokes (Mythic/Legendary cards) — FIXED.** Those cards have a GRADIENT stroke
in Figma (FFFFFF→3F0076→1A072A); the tool used to fall back to the darkest stop → dark border.
Fix shipped in **`Generator.lua` (`applyStroke`)**: when the stroke paint is a gradient
(normalizePaint already emits gradientStops for strokes), it now creates a **`UIGradient` as a
CHILD of the `UIStroke`** with those stops (reusing the existing fill-gradient/ColorSequence
builder) — the native Roblox approach, CONFIRMED vs API docs. **VERIFIED:** special cards show
proper gradient borders in Studio.

**(b) OVER-BAKING that swallowed buttons — FIXED via composition-based decorative-pile rule.**
Root cause was `shouldRasterizeGroup` being both too greedy (baking containers that held
interactive children) AND too blind (a pile of plain filled RECTANGLES hit none of the
effect/gradient/vector triggers, so a 27-rect `InnerStroke` decorative stack leaked as loose
shapes). Fix = a new **composition** rule in `shouldRasterizeGroup`: bake a group whose direct
children are overwhelmingly plain, text-less, childless shapes
(RECTANGLE/VECTOR/ELLIPSE/LINE/STAR/POLYGON) past `DECOR_PILE_THRESHOLD = 8` — BUT only if the
group has **NO text and NO interactive children** (`looksLikeButton`/`nameLooksLikeButton`
guard). So decoration bakes to one PNG; tabs/buttons/close (`*Tab`, `CrossButton`) and any text
survive as native instances. Driven by composition, not names → generalizes to any messy design.
**VERIFIED:** the 27-rect `InnerStroke` pile collapsed to `MainFrame → InnerStroke → UICorner,
UIStroke, Main`; `SearchBar/BackpackIcon/PlayerIcon` stayed clean named nodes; Quests + Redeem
came through fully structured with native buttons.

**(c) BONUS improvement — button/input typing.** Detected non-baked buttons now emit
`ImageButton` and search/input fields emit `TextBox` (using existing Generator prefix mappings)
— so interactive elements come out as the correct clickable/typable class, ready to wire.

**FINAL VERIFICATION (5–6 designs):** Quests (best conversion — clean `Quest1/2/3`, native
Claim/text/UIGradient/UIStroke), Redeem (named input + button), Shop (sunbursts baked correctly),
Inventory/anime4 (decor-pile collapsed), Anime UI (grid + gradient strokes holding). Pipeline
converts all faithfully. All fixes accumulated into ONE `code.ts` (braces verified balanced) +
`Generator.lua`. Recompile `code.ts`→`code.js`, copy to Windows, reload.

**Confirmed NOT a bug:** a design showing "only ~4 objects but full UI" = auto-rasterize working
as designed (decorative art → 1 PNG). Editability-vs-fidelity tradeoff, correct for decoration —
and (b)'s guard now ensures it never swallows interactive/text children.

### 6. ROBLOX 2026 UPDATES (verify vs official docs before relying)
User surfaced mid-2026 Roblox UI updates (from a Gemini summary — treat as leads, confirm on
create.roblox.com/docs): native **UIShadow** primitive (blur/color/offset/spread — could map
Figma drop-shadows natively instead of baking); **individual corner rounding** on UICorner
(`TopLeftRadius`/`TopRightRadius`/`BottomLeftRadius`/`BottomRightRadius` — could match Figma
per-corner radii); **gradient strokes** (UIGradient child of UIStroke — CONFIRMED true, used
in fix 5a). These are fidelity ENHANCEMENTS for later, not blockers.

### REMAINING GEMINI EXPORT BUGS (still queued — Gemini #1/gradient-stroke/decor-pile are now DONE)
- **#2 absoluteBoundingBox rotation drift:** a rotated node inflates its axis-aligned
  `absoluteBoundingBox`, throwing off sibling X/Y math (serialiseNode ~line 776). Fix = use
  `absoluteRenderBounds` or `relativeTransform` for true bounds.
- **#3 pixel vs scale in layout padding** (UIListLayout/UIPadding gaps frozen across devices).
- **#4 TextScaled microscopic text** — check `textAutoResize` before hard TextScaled clamp.

### FILES CHANGED THIS SESSION (in /outputs, latest)
- **server.js** (sameSite lax, session-secret fail-fast, x-powered-by disable, cors explicit)
- **routes/api.js** (base64 split: strip on export, re-attach on import)
- **models/ProjectImages.js** (NEW)
- **routes/dashboard.js** (ProjectImages import fix + delete cleanup)
- **views/pages/dashboard.ejs** (toast system, no native alerts)
- **code.ts** (looksLikeGrid pure-grid fix + normalizePaint alpha fix + DECOR_PILE_THRESHOLD
  composition bake rule + ImageButton/TextBox emission) → RECOMPILE to code.js
- **Generator.lua** (gradient-stroke fix: UIGradient child of UIStroke in applyStroke)
- **CLAUDE.md** (this file)

### CROSS-REF: non-Bloxig items this session are in `bloxig-hackathon-ctf-plan.md`
AMD ACT II Hackathon (Unicorn Track = Bloxig, starts Jul 6), HTB Cyber Apocalypse
(Jul 24–29), **ISC2 CC exam DEADLINE Jul 31** (in-person Pearson VUE, schedule NOW),
MetaHoof/Ultra bug report (in-scope, fixed in 2h, unresponsive — send 1 final email, then
let go). July is stacked — protect the CC deadline + hackathon start; ship Bloxig first.


## 🟢🟢🟢 SESSION 2026-07-04 — AUTO-GRID + ERROR REPORTING (supersedes all below)

### Auto-grid shipped — card grids now import as responsive ScrollingFrame+UIGridLayout, ZERO tagging
The tool now AUTO-detects a card grid and builds a real scrollable, reflowing grid — no
`.scrollv`/`.grid` tag needed (matches the "automate everything" goal). Verified on the
Sword-shop product grid and coin shop: cards flow evenly, reflow responsively across device
sizes (tighter on iPhone 7, wider on iPhone 11), and are clone-ready (UIGridLayout positions
runtime-cloned cards automatically). This closes the biggest remaining FUNCTIONAL gap — grids
were static pictures before, now they're live inventories.

**How it works (both sides):**
- **Export (code.ts → `looksLikeGrid`):** a container with 2+ same-sized card-frames (each
  holding TEXT, within 4px of each other) is auto-tagged `grid` in the exported prefixes.
- **Generator.lua:**
  - `grid` prefix (or `.scrollv`/`.scrollh` with 2+ children) sets `isGrid`. Bare `.grid`
    promotes to `scrollv` (vertical scroll by default).
  - `applyAutoGrid(inst, node)` — adds a UIGridLayout; `CellSize` from first child's dims,
    `CellPadding` from the gap between child 1 and child 2, `SortOrder=LayoutOrder`.
  - Sets `Bloxig_Grid` attribute on the container.
  - Child positioning: when `parent:GetAttribute("Bloxig_Grid")==true`, children SKIP
    `inst.Position` and get `LayoutOrder` instead (grid flows them). This is the ONE place
    pixel positions are intentionally overridden — a reflowing grid needs it.

**TRADEOFF (by design):** a grid REFLOWS, so it is NOT a pixel-match to the Figma layout.
For inventories/shops that's the desired behaviour. If a specific design needs exact Figma
positions, tag the container `.native` to keep it fixed (never becomes a grid).

**KNOWN TUNING (from 07-04 test, not yet fixed):**
1. Non-card siblings inside the same container (e.g. a "Description" panel next to the cards)
   can get sucked into the grid flow. Refinement = exclude odd-sized children from the grid,
   only flow the uniform cards. NEEDS the detection to separate "cards" from "other".
2. Card CONTENT fidelity (rarity tags/inner text faint on some cards) — separate polish.

### Error-reporting fix (Main.lua)
The confirm handler declared `applyErr` but NEVER assigned it — every failure printed
"Import failed: unknown error". Now captures the pcall's error return
(`local ok, applyErr = pcall(...)`) AND `warn()`s it to Output. Future failures show the
REAL message. (This was why the Sword-shop "unknown error" was uninformative — the import
had actually mostly succeeded; a later nil threw and the reporting hid it.)

### FILES CHANGED THIS SESSION (in /outputs, latest versions)
- **code.js** (compiled, ready — DROP ON WINDOWS, no build needed) + **code.ts** (source) —
  auto-grid detection `looksLikeGrid` + earlier button/raster logic.
- **Generator.lua** (→ Mac roblox-plugin/src/) — grid prefix, applyAutoGrid, grid-child
  position skip.
- **Main.lua** (→ Mac) — upload-first reorder + error reporting fix.
- **ImageUploader.lua** (→ Mac) — warm-up ping + 4x retry w/ 2/4/6s backoff (kills
  ServerProtocolError cold-start drops).
- **CLAUDE.md** — this file.

### DEPLOY REMINDER
- Windows figma-plugin folder: **code.js** only (Windows has NO Node; can't compile —
  Claude/Mac compiles, copy the .js). Reload plugin in Figma → re-export. `exportedAt`
  timestamp updating = proof the new build ran.
- Mac roblox-plugin/src/: Generator.lua, Main.lua, ImageUploader.lua (Lua, no build).
- Commit + push both branches: `git add -A && git commit && git push && git push origin master:main`
- ⚠️ STILL not fixed permanently: the two-machine sync. Commit figma-plugin/ to the repo so
  Windows can `git pull` instead of hand-copying code.js. (Cost ~1hr on 06-24.)

### REMAINING PUNCH-LIST (post auto-grid)
1. Grid detection refinement — exclude non-card siblings (Description panels etc.) from grid flow.
2. Card content fidelity (faint inner text/rarity tags).
3. Loose-frame synthesis (files with no wrapping frame — synth root from selection bbox).
4. (deferred) Move base64 OUT of Mongo doc — upload at export-time, store only name→assetId map.
5. General fidelity tuning across more designs.

---

## 🟢🟢 SESSION 2026-06-24 — AUTO-RASTERIZE SHIPPED + IMAGE UPLOAD WORKING (supersedes all below)

### THE BREAKTHROUGH: auto-rasterize works on 4 real designs
The keystone feature is built and verified. The tool now AUTO-detects which Figma
groups are decorative/effect-heavy and bakes them to ONE flat PNG (replicating the
manual "hide text → export group as PNG → re-add text" workflow), while keeping
structural/interactive parts native. No manual `.raster` tagging needed (Figblox makes
users tag everything; Bloxig auto-detects — this is the real moat).

**Verified on 4 different anime/shop UIs** (all imported RECOGNIZABLY, was "2216 nodes of
white garbage" before): FlashyAnimeUI inventory, Shop UI 23 (best result), Quest Frame,
coin Shop UI. The engine GENERALIZES across very different art styles — the thing that
needed proving before launch.

### How auto-rasterize works (all in figma-plugin/code.ts v1.4, ~865 lines)
- `shouldRasterizeGroup(node, parsed)` — SINGLE source of truth (serialiseNode AND
  collectImages both call it). Bakes a container if: has visible effects (glow/shadow/
  blur), OR non-linear gradient (radial/angular/diamond), OR blend mode, OR >=4 vectorish
  children (RASTER_VECTOR_THRESHOLD). 
- Guards (never bake): the export ROOT (`__exportRootId`, set in handleExport — else it
  flattens the whole UI into one PNG, which was a real bug we hit), `.scrollv/.scrollh/
  .canvas` tagged nodes (must stay live ScrollingFrames), and real GRIDS (2+ sibling
  card-frames each holding text — `subtreeHasStructure`).
- `looksLikeButton()` / `nameLooksLikeButton()` — name contains button/btn/tab/close/
  cross, or lone "X" → bakes AS ImageButton (tags `imagebutton` in the bake branch so the
  Generator builds a clickable ImageButton, not a dead ImageLabel). VERIFIED: coin-shop
  tabs (Coins/Weapons/Boosters/Packs) + X now come through `img=True prefixes=['imagebutton']`.
- `textIsNativeSafe(t)` — plain solid-fill text, no effects/rotation/blend/gradient-stroke
  → PULLED OUT as editable TextLabel on top of the baked art. Stylized text (gradient/glow/
  rotated) stays baked into the image (Roblox can't render it faithfully anyway).
- `collectNativeSafeText` / `collectNativeSafeTextNodes` — extract editable text; in
  collectImages the bake does hide-text → exportAsync(PNG, 2x) → RESTORE visibility in a
  `try/finally` (never leaves the user's Figma file with hidden text).

### Server fixes shipped this session (all live on master+main)
- **Image hash-dedupe (routes/imageUpload.js).** Real anime UIs reuse one texture 50+
  times (one design: 159 image entries → only 32 unique by md5). Server now hashes each
  base64, uploads each UNIQUE image ONCE, fans the asset id to every name sharing the hash.
  159 uploads → 32. The `>60` cap now applies to UNIQUE count, not raw. Kills the 413 +
  the rate-limit churn. Returns `stats:{received,uploaded}`.
- **Export size guard** raised 14MB → 15.5MB in routes/api.js (band-aid; Mongo doc hard
  cap is 16MB; real fix = stop storing base64 in the doc, deferred).

### Roblox plugin fixes (Generator.lua, committed)
- Decal→texture resolution: Open Cloud returns a DECAL id; ImageLabel.Image needs the
  underlying texture or renders blank. Now resolves via InsertService:LoadAsset → read
  Decal.Texture → assign (cached, moderation-pending fallback to rbxassetid://id). FIXED
  the blank-images problem.
- CanvasGroup for opacity<1 groups (whole subtree fades like Figma, not just background).
- buildFromJSON rootFrame crash patched.

### ⚠️⚠️ THE TWO-MACHINE TRAP (this wasted ~1hr this session — READ)
Figma plugin code edited on the MAC does NOTHING — Figma exports run on the WINDOWS laptop,
which has its OWN copy of code.js. Symptoms: every `curl .../api/import/<id>` kept showing
the SAME `exportedAt` timestamp no matter what — because NO fresh export happened (the
Windows plugin was stale). 
- **The tell:** `exportedAt` in the pulled JSON does NOT change = no new export ran.
- **Windows has NO Node.js** → can't run `npx tsc` there. So: COMPILE code.ts → code.js on
  a machine that has Node (Mac, or have Claude compile it), then copy ONLY the compiled
  `code.js` to the Windows figma-plugin folder (Figma needs just code.js + ui.html +
  manifest.json — NOT the .ts, NOT Node). Reload plugin in Figma (Windows) → re-export →
  re-pull. `exportedAt` updating = proof it took.
- **FIX THIS PERMANENTLY:** commit figma-plugin/ to the repo; `git pull` on Windows to sync.
  Stop hand-copying files between machines.

### Debug recipe (Mac, pulls what Windows exported)
```
curl -s --compressed -H "Authorization: Bearer <JWT>" \
  https://bloxig.onrender.com/api/import/<PROJECT_ID> -o out.json
# check a fresh export actually ran:
python3 -c "import json;print(json.load(open('out.json'))['json_layout_data']['exportedAt'])"
# inspect what baked / prefixes:
python3 -c "import json;d=json.load(open('out.json'))['json_layout_data'];
def f(ns):
 [ (print(n['name'],bool(n.get('imageName')),n.get('prefixes')), f(n.get('children'))) for n in ns or [] ]
f(d['nodes'])"
```
NOTE: same Figma frame = same project id (upsert by figma_frame_id), even after rename.

### STILL TO TUNE / BUILD (post auto-raster, priority order)
1. **Card grids → ScrollingFrame.** Tag Container `.scrollv` → stays native scroll frame;
   import ONE card template + UIGridLayout + a script that clones it per item (the standard
   pattern). `.scroll*`/`.canvas` force-native guard already in code.ts.
2. **Upload-ordering UX.** Currently imports EMPTY first, THEN uploads+links → user sees a
   broken-then-fixed flash. Also `ServerProtocolError` on big uploads (Render free-tier
   cold-start drops the connection; it retries and eventually succeeds). Fix = upload images
   FIRST, then import+link in one pass; batch uploads (not all 12+ at once).
3. **Loose-frame synthesis** — files with no wrapping frame (FlashyAnimeUI): synthesize a
   root from the selection bounding box. Spec'd, not coded.
4. **Move base64 OUT of Mongo doc** (deferred) — upload at export-time, store only
   name→assetId map. Retires the 15.5MB band-aid + 16MB cap + double-storage.
5. Tune `RASTER_VECTOR_THRESHOLD` + the text classifier against more real designs.

### Pricing note (matches landing): $12/mo, $99/yr, $49 lifetime ($49 lifetime is the
price wedge vs Figblox $12.99/$99/$149).

---

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
