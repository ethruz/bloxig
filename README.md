# Bloxig — Figma → Roblox UI, with AI that writes the interaction code

**Bloxig converts Figma UI designs into native Roblox UI — and its AI writes the Roblox code that makes the result actually playable.**

Live product: **https://bloxig.onrender.com**

Bloxig's entry for the **AMD Developer Hackathon (ACT II) — Track 3: Unicorn (Open Innovation)**.

---

## The problem

Roblox has millions of creators, and every one of them who wants polished UI faces the same wall. Designers mock UI in Figma; developers then rebuild every frame, button, and layout by hand in Roblox Studio. Existing design-to-Roblox tools can convert how a UI *looks* — but the result is **static**. Buttons don't click. Close buttons do nothing. A design file contains no interaction logic, so no tool generates it, and you still write every click handler yourself.

## What Bloxig does

Bloxig is a real, deployed product with three parts:

1. **A Figma plugin** that exports a design into a structured, engine-neutral JSON representation.
2. **A web app + backend** (Node/Express on Render) that stores projects and hosts the AI interaction service.
3. **A Roblox Studio plugin** that rebuilds the design as native Roblox UI *and* wires up its interactivity.

The result: a design becomes a **playable** Roblox UI — click a claim button and it responds, click the close button and the panel closes — with the interaction code generated for you.

```
Figma design -> export -> Bloxig web app -> import in Roblox Studio -> playable UI
```

---

## Powered by AMD

The AI interaction layer runs on **AMD compute**, end to end:

- The interaction model — **Kimi K2**, a top open model for code generation — is served through the **Fireworks AI API** (an OpenAI-compatible endpoint the Node backend calls).
- Fireworks runs that inference on **AMD Instinct GPUs**. Every generated Roblox `LocalScript` is written on AMD silicon.
- AMD is on the critical path: it powers the one feature that turns Bloxig from a converter into a UI *production* tool.

The AMD/Fireworks call lives in `routes/aiWire.js`:

```js
const FIREWORKS_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const MODEL = 'accounts/fireworks/models/kimi-k2p6'; // served on AMD Instinct GPUs
```

We chose Kimi K2 deliberately — a strong open coding model — over the obvious defaults, because writing correct Luau is a code-generation task.

---

## The core innovation: structure-based interactivity detection

The hard part isn't generating the click code — it's knowing **which** elements are interactive, when a design file gives you no click logic and users name their layers however they like (`Btn_Dismiss`, `collectReward`, `Group 47`, or another language entirely).

Bloxig detects interactivity by **structure, position, and text — not by layer name**:

- A text-bearing box with a fill or stroke at button scale is a **button**.
- A small square in the top-right corner is a **close button**.
- An evenly-spaced row of same-size siblings is a **tab bar**.

This works on any design, regardless of naming — even on elements that were auto-rasterized into images. Deterministic heuristics find the candidate elements and their position/text context; the AI infers each element's role and generates the Luau; and a deterministic verification pass guarantees **every** detected element is wired (LLMs are non-deterministic, so we never rely on the model to be exhaustive).

This split — **heuristics for structure, AI for semantics, verification for reliability** — mirrors how commercial design-to-code systems (e.g. Locofy) operate, and is validated by UI-semantics research (e.g. Alibaba's view-hierarchy grouping). The difference: **Bloxig applies it to Roblox / Luau**, a platform of millions of creators that none of those tools serve.

---

## Repository layout

| Path | What it is |
|------|------------|
| `figma-plugin/` | The Figma plugin. Exports designs and runs the structure-based interactivity detection (`code.ts`). |
| `roblox-plugin/src/` | The Roblox Studio plugin. Rebuilds the UI and wires interactivity (`Generator.lua`, `Main.lua`, `SmartMerge.lua`, `ScaleConverter.lua`). |
| `routes/aiWire.js` | The AMD/Fireworks interaction service — takes detected elements + context, calls **Kimi K2 on Fireworks (AMD)**, returns the interaction Luau. |
| `routes/` | Web app + API routes (projects, import/export, auth). |
| `server.js` | Express server entry point. |
| `views/`, `public/` | The Bloxig web app frontend. |

Secrets (API keys, database credentials) are read from environment variables and are **not** committed.

---

## How it works, step by step

1. **Export** — the Figma plugin serializes the design to neutral JSON, running structure detection to stamp each node with `interactive` / `roleHint` / `uiContext`.
2. **Convert** — the Roblox plugin rebuilds the design as native Roblox UI, preserving frames, text, images, layout, colour and scale.
3. **Detect + wire** — for each interactive element, Bloxig overlays a clickable control and calls the AMD-hosted model to generate the behaviour (close, claim, action), then verifies every element is handled.
4. **Playable** — the UI drops into Studio already working.

---

## Roadmap

Detection currently makes elements clickable and generates click behaviour. Next:

- **Tab & content switching** — the same structural detection, extended from "what is interactive" to "how it transitions"
- **Hover states & animations**, AI-generated
- **Multi-engine export** beyond Roblox — a neutral intermediate-representation core means new design sources and new engines are adapters, not rebuilds

---

## Links

- **Live product:** https://bloxig.onrender.com
- Built for the **AMD Developer Hackathon - ACT II - Track 3 (Unicorn / Open Innovation)**

---

*Bloxig doesn't just convert your design into a Roblox UI — its AI writes the code that makes it playable.*
