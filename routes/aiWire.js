// routes/aiWire.js — Bloxig AI interaction layer (HARDENED)
// ============================================================
// Mount in server.js as: app.use('/api/ai/wire', require('./routes/aiWire'))
// Route path is '/' because the mount point already carries '/api/ai/wire'.

const express = require('express');
const router  = express.Router();
const { verifyJWT } = require('../middleware/isAuthenticated');

const USE_STUB = false; // live Kimi via Fireworks

const FIREWORKS_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const MODEL = 'accounts/fireworks/models/kimi-k2p6';

// ── Per-user AI rate limiter (in-memory, single-instance safe) ──
const AI_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000, // 1 hour
  freeMax: 5,
  proMax:  20,
  lifetimeMax: 20
};
const userAiLimits = new Map(); // userId -> { count, resetTime }

function checkAiRateLimit(userId, plan) {
  const now = Date.now();
  let limit;
  if (plan === 'Free') limit = AI_RATE_LIMIT.freeMax;
  else if (plan === 'Lifetime') limit = AI_RATE_LIMIT.lifetimeMax;
  else limit = AI_RATE_LIMIT.proMax;

  const entry = userAiLimits.get(userId);
  if (!entry || now > entry.resetTime) {
    userAiLimits.set(userId, { count: 1, resetTime: now + AI_RATE_LIMIT.windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) {
    const minsLeft = Math.ceil((entry.resetTime - now) / 60000);
    return { allowed: false, retryAfter: minsLeft };
  }
  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

// ── POST /api/ai/wire ─────────────────────────────────────────
router.post('/', verifyJWT, async (req, res) => {
  try {
    const { elements } = req.body;
    if (!Array.isArray(elements) || elements.length === 0) {
      return res.status(400).json({ error: 'no_elements' });
    }

    // ── Rate limit check ──────────────────────────────────────
    const userId = req.user._id.toString();
    const plan   = req.user.subscription_status || 'Free';
    const rateCheck = checkAiRateLimit(userId, plan);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: 'ai_rate_limit',
        message: `AI wiring limit reached (${plan}: ${plan === 'Free' ? 5 : 20}/hour). Retry in ${rateCheck.retryAfter} minutes. Upgrade to Pro for more.`
      });
    }

    if (USE_STUB) {
      const luau = generateStubLuau(elements);
      return res.json({ luau, model: 'stub' });
    }

    if (!process.env.FIREWORKS_API_KEY) {
      console.error('[AI Wire] FIREWORKS_API_KEY missing');
      return res.status(500).json({ error: 'ai_service_unavailable' });
    }

    const fwRes = await fetch(FIREWORKS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.FIREWORKS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0.2,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user',   content: buildUserPrompt(elements) },
        ],
      }),
    });

    if (!fwRes.ok) {
      const detail = await fwRes.text().catch(() => 'unknown');
      console.error('[AI Wire] Fireworks error:', fwRes.status, detail.slice(0, 200));
      return res.status(502).json({ error: 'ai_generation_failed' });
    }

    const data = await fwRes.json();
    let luau = data.choices?.[0]?.message?.content || '';
    luau = stripFences(luau);
    if (!luau) {
      return res.status(502).json({ error: 'empty_generation' });
    }

    return res.json({ luau, model: MODEL });
  } catch (err) {
    console.error('[AI Wire] Server error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ────────────────────────────────────────────────────────────
// STUB: build working Luau from the element names (no AI needed).
// ────────────────────────────────────────────────────────────
function generateStubLuau(elements) {
  const lines = [];
  lines.push('-- Bloxig AI interaction layer (stub build)');
  lines.push('local root = script.Parent');
  lines.push('local UIS = game:GetService("UserInputService")');
  lines.push('UIS.MouseBehavior = Enum.MouseBehavior.Default');
  lines.push('UIS.MouseIconEnabled = true');
  lines.push('');

  for (const el of elements) {
    const raw  = String(el.name || '');
    const n    = raw.toLowerCase();
    // Properly escape for Lua strings: backslash FIRST, then quotes, then newlines
    const safe = raw
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');

    if (n.includes('close') || n.includes('cross') || n === 'x') {
      lines.push(`do -- ${safe} (close)`);
      lines.push(`  local btn = root:FindFirstChild("${safe}", true)`);
      lines.push(`  if btn and btn:IsA("GuiButton") then`);
      lines.push(`    btn.MouseButton1Click:Connect(function() root.Visible = false end)`);
      lines.push(`  end`);
      lines.push(`end`);
      lines.push('');
      continue;
    }

    if (n.includes('claim')) {
      lines.push(`do -- ${safe} (claim)`);
      lines.push(`  local btn = root:FindFirstChild("${safe}", true)`);
      lines.push(`  if btn and btn:IsA("GuiButton") then`);
      lines.push(`    btn.MouseButton1Click:Connect(function()`);
      lines.push(`      if btn:IsA("TextButton") then btn.Text = "Claimed!" end`);
      lines.push(`      btn.AutoButtonColor = false`);
      lines.push(`      print("[Bloxig] Reward hook: fire your RemoteEvent here for ${safe}")`);
      lines.push(`    end)`);
      lines.push(`  end`);
      lines.push(`end`);
      lines.push('');
      continue;
    }

    if (n.includes('tab')) {
      const base = raw.replace(/tab/i, '');
      lines.push(`do -- ${safe} (tab)`);
      lines.push(`  local btn = root:FindFirstChild("${safe}", true)`);
      lines.push(`  local content = root:FindFirstChild("${base}Content", true)`);
      lines.push(`  if btn and btn:IsA("GuiButton") then`);
      lines.push(`    btn.MouseButton1Click:Connect(function()`);
      lines.push(`      for _, o in ipairs(root:GetDescendants()) do`);
      lines.push(`        if o:IsA("GuiObject") and o.Name:match("Content$") then o.Visible = false end`);
      lines.push(`      end`);
      lines.push(`      if content then content.Visible = true end`);
      lines.push(`    end)`);
      lines.push(`  end`);
      lines.push(`end`);
      lines.push('');
      continue;
    }

    if (el.className === 'TextBox' || n.includes('input') || n.includes('search')) {
      lines.push(`do -- ${safe} (input)`);
      lines.push(`  local box = root:FindFirstChild("${safe}", true)`);
      lines.push(`  if box and box:IsA("TextBox") then`);
      lines.push(`    box.FocusLost:Connect(function() print("[Bloxig] input '${safe}':", box.Text) end)`);
      lines.push(`  end`);
      lines.push(`end`);
      lines.push('');
      continue;
    }

    lines.push(`do -- ${safe} (generic)`);
    lines.push(`  local btn = root:FindFirstChild("${safe}", true)`);
    lines.push(`  if btn and btn:IsA("GuiButton") then`);
    lines.push(`    btn.MouseButton1Click:Connect(function() print("[Bloxig] clicked ${safe}") end)`);
    lines.push(`  end`);
    lines.push(`end`);
    lines.push('');
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────
// Prompt builders
// ────────────────────────────────────────────────────────────
function buildSystemPrompt() {
  return [
    'You are a Roblox Luau expert. You write a single LocalScript that wires up UI.',
    '',
    'Context: the script is a LocalScript whose Parent is the root UI frame.',
    'Some interactive elements are TRANSPARENT overlay TextButtons placed on top of a',
    'visible element — for those, the VISIBLE element is the overlay button\'s Parent.',
    '',
    'Each element you are given has a "hint" telling you its intended behavior:',
    '- "close": when clicked, set root.Visible = false (hide the whole panel).',
    '- "claim": the element is a TRANSPARENT overlay button — NEVER set its own .Text',
    '    (that shows ugly black text). Instead give feedback on the VISIBLE element,',
    '    which is the overlay button\'s Parent:',
    '      local label = btn.Parent',
    '      if label and (label:IsA("TextLabel") or label:IsA("TextButton")) then',
    '        label.Text = "Claimed!"',
    '      end',
    '    Use a local `claimed` flag so it only fires once, set btn.Active = false,',
    '    and print("[Bloxig] reward hook: " .. btn.Name).',
    '- "tab": clicking shows the matching *Content frame and hides sibling *Content frames.',
    '- "generic": print("[Bloxig] clicked " .. button.Name) on click.',
    '',
    'NEVER set .Text on an overlay/transparent button — always target its Parent label.',
    '',
    'Rules you MUST follow:',
    '- Output ONLY valid Luau code. No explanations, no markdown fences.',
    '- local root = script.Parent',
    '- At the TOP of the script, keep the mouse free + visible so the UI is clickable',
    '  in Play mode:',
    '    local UIS = game:GetService("UserInputService")',
    '    UIS.MouseBehavior = Enum.MouseBehavior.Default',
    '    UIS.MouseIconEnabled = true',
    '- Find each element by its exact name: root:FindFirstChild(name, true).',
    '- Connect with element.MouseButton1Click:Connect(function() ... end).',
    '- Guard EVERY element access with an if check so a missing element never errors.',
    '- Do NOT invent elements that are not in the provided list.',
  ].join('\n');
}

function buildUserPrompt(elements) {
  const list = elements.map((e) => {
    const c = e.context || {};
    // SANITIZE: strip quotes, backslashes, newlines, control chars; hard cap length
    const safeName = String(e.name || '')
      .replace(/["\\]/g, '')           // remove quotes and backslashes
      .replace(/[\n\r\t]/g, ' ')       // flatten whitespace
      .replace(/[^\x20-\x7E]/g, '')    // strip non-printable
      .slice(0, 50);                   // hard cap 50 chars

    const safeText = c.text
      ? String(c.text).slice(0, 30).replace(/["\\]/g, '')
      : '';

    const bits = [];
    if (safeText) bits.push(`text:"${safeText}"`);
    if (c.zoneY || c.zoneX) bits.push(`pos:${c.zoneY || 'middle'}-${c.zoneX || 'center'}`);
    if (c.rowMember) bits.push('part-of-row');
    const ctx = bits.length ? ` {${bits.join(', ')}}` : '';
    return `- ${safeName} (${e.className}) [hint: ${e.hint || 'generic'}]${ctx}`;
  }).join('\n');

  return [
    'Here are the interactive UI elements Bloxig auto-detected by STRUCTURE (not by',
    'layer name). Each has a hint (a first guess) and context (its text + position',
    'zone + whether it sits in an evenly-spaced row). Use the context to refine the',
    'role if the hint seems wrong — e.g. a small element at top-right with text "x"',
    'is a close button; several same-size elements in a row are tabs.',
    '',
    list,
    '',
    'Write a single LocalScript that wires each element by its (possibly refined) role.',
    'Return only the Luau code.',
  ].join('\n');
}

function stripFences(s) {
  let out = s || '';
  const fenced = out.match(/```(?:lua|luau)?\s*([\s\S]*?)```/i);
  if (fenced) out = fenced[1];
  out = out.replace(/```/g, '').replace(/\uFEFF/g, '').trim();

  const luaStart = /^\s*(--|local\b|function\b|if\b|for\b|while\b|do\b|return\b|end\b|repeat\b|[A-Za-z_][\w.]*\s*[:.(=]|game\b|script\b|workspace\b)/;
  const lines = out.split('\n');
  let start = 0;
  while (start < lines.length && lines[start].trim() !== '' && !luaStart.test(lines[start])) {
    start++;
  }
  out = lines.slice(start).join('\n').trim();

  if (!/local\s+root\s*=/.test(out)) {
    out = 'local root = script.Parent\n' + out;
  }
  return out;
}

module.exports = router;