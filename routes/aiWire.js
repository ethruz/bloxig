// routes/aiWire.js
// Bloxig AI interaction layer.
//
// USE_STUB = true  -> generates working Luau locally (NO API key needed).
//                     Use this NOW to prove the full round trip in Studio.
// USE_STUB = false -> calls Gemma 4 via Fireworks (needs FIREWORKS_API_KEY).
//                     Flip to this once your Fireworks credit is set in Render.

const express = require('express');
const router = express.Router();

const USE_STUB = false; // <-- flip to false when FIREWORKS_API_KEY is live

const FIREWORKS_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const MODEL = 'accounts/fireworks/models/gemma-4-26b-a4b-it'; // confirm exact id in Fireworks dashboard

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
    'You are a Roblox Luau expert. You write LocalScripts that wire up UI.',
    '',
    'Rules you MUST follow:',
    '- Output ONLY valid Luau code. No explanations, no markdown fences.',
    '- The script is a LocalScript placed inside the UI (script.Parent = the root).',
    '- Find elements by exact name with: root:FindFirstChild(name, true).',
    '- Buttons are ImageButton or TextButton. Use element.MouseButton1Click:Connect(...).',
    '- Close/cross buttons: set root.Visible = false.',
    '- Claim buttons: show a claimed state and print a reward hook placeholder.',
    '- Tabs: clicking a tab shows its matching content frame and hides sibling contents.',
    '- Guard EVERY element access with an if check so a missing element never errors.',
    '- Do NOT invent elements that are not in the provided list.',
  ].join('\n');
}

function buildUserPrompt(elements) {
  const list = elements.map((e) => `- ${e.name} (${e.className})`).join('\n');
  return [
    'Here are the interactive UI elements Bloxig converted:',
    '',
    list,
    '',
    'Write a single LocalScript that wires sensible default behavior for each',
    'interactive element. Return only the Luau code.',
  ].join('\n');
}

function stripFences(s) {
  return s.replace(/```lua\s*/gi, '').replace(/```\s*/g, '').trim();
}

module.exports = router;