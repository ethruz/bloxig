// routes/aiWire.js
// Bloxig AI interaction layer.
//
// USE_STUB = true  -> generates working Luau locally (NO API key needed).
//                     Use this NOW to prove the full round trip in Studio.
// USE_STUB = false -> calls Gemma 4 via Fireworks (needs FIREWORKS_API_KEY).
//                     Flip to this once your Fireworks credit is set in Render.

const express = require('express');
const router = express.Router();

const USE_STUB = false; // live Kimi (FIREWORKS_API_KEY set in Render)

const FIREWORKS_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const MODEL = 'accounts/fireworks/models/kimi-k2p6'; // serverless on this account

router.post('/api/ai/wire', async (req, res) => {
  try {
    const { elements } = req.body; // [{ name, className }, ...]
    if (!Array.isArray(elements) || elements.length === 0) {
      return res.status(400).json({ error: 'no_elements' });
    }

    if (USE_STUB) {
      const luau = generateStubLuau(elements);
      return res.json({ luau, model: 'stub' });
    }

    // ---- Real Gemma 4 via Fireworks ----
    if (!process.env.FIREWORKS_API_KEY) {
      return res.status(500).json({ error: 'missing_fireworks_key' });
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
          { role: 'user', content: buildUserPrompt(elements) },
        ],
      }),
    });

    if (!fwRes.ok) {
      const detail = await fwRes.text();
      return res.status(502).json({ error: 'fireworks_failed', detail });
    }

    const data = await fwRes.json();
    let luau = data.choices?.[0]?.message?.content || '';
    luau = stripFences(luau);
    if (!luau) return res.status(502).json({ error: 'empty_generation' });

    return res.json({ luau, model: MODEL });
  } catch (err) {
    return res.status(500).json({ error: 'server_error', detail: String(err) });
  }
});

// ────────────────────────────────────────────────────────────
// STUB: build working Luau from the element names (no AI needed).
// Detects close/cross, claim, tabs, and text inputs by name.
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
    const raw = String(el.name || '');
    const n = raw.toLowerCase();
    const safe = raw.replace(/"/g, '\\"');

    // close / cross / X buttons -> hide the whole UI
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

    // claim buttons -> show a claimed state + reward hook
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

    // tab buttons -> show matching content frame, hide sibling *Content frames
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

    // text inputs -> report value on focus lost (light touch)
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

    // generic button -> print on click so nothing is dead
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
// Real Gemma prompt (used when USE_STUB = false)
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
    '    local UIS = game:GetService(\"UserInputService\")',
    '    UIS.MouseBehavior = Enum.MouseBehavior.Default',
    '    UIS.MouseIconEnabled = true',
    '- Find each element by its exact name: root:FindFirstChild(name, true).',
    '- Connect with element.MouseButton1Click:Connect(function() ... end).',
    '- Guard EVERY element access with an if check so a missing element never errors.',
    '- Do NOT invent elements that are not in the provided list.',
  ].join('\n');
}

function buildUserPrompt(elements) {
  const list = elements
    .map((e) => {
      const c = e.context || {};
      const bits = [];
      if (c.text)      bits.push(`text:"${String(c.text).slice(0, 30)}"`);
      if (c.zoneY || c.zoneX) bits.push(`pos:${c.zoneY || 'middle'}-${c.zoneX || 'center'}`);
      if (c.rowMember) bits.push('part-of-row');
      const ctx = bits.length ? ` {${bits.join(', ')}}` : '';
      return `- ${e.name} (${e.className}) [hint: ${e.hint || 'generic'}]${ctx}`;
    })
    .join('\n');
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
  return s.replace(/```lua\s*/gi, '').replace(/```\s*/g, '').trim();
}

module.exports = router;
