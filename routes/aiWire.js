// routes/aiWire.js
// Bloxig AI interaction layer — takes the converted UI's interactive elements,
// asks Gemma 4 (via Fireworks, AMD-hosted) to write the Luau that wires them up,
// and returns the code. The API key NEVER leaves the server.

const express = require('express');
const router = express.Router();

const FIREWORKS_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

// IMPORTANT: confirm the exact Gemma 4 model id in your Fireworks dashboard
// (Models tab). This is the likely string; adjust if the dashboard differs.
const MODEL = 'accounts/fireworks/models/gemma-4-27b-it';

router.post('/api/ai/wire', async (req, res) => {
  try {
    const { elements } = req.body; // [{ name, className }, ...]
    if (!Array.isArray(elements) || elements.length === 0) {
      return res.status(400).json({ error: 'no_elements' });
    }

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
        temperature: 0.2, // low = consistent, less hallucinated Luau
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

function buildSystemPrompt() {
  return [
    'You are a Roblox Luau expert. You write LocalScripts that wire up UI.',
    '',
    'Rules you MUST follow:',
    '- Output ONLY valid Luau code. No explanations, no markdown fences.',
    '- The script is a LocalScript placed inside the UI ScreenGui.',
    '- Find elements by exact name with: root:FindFirstChild(name, true).',
    '- Buttons are ImageButton or TextButton. Use element.MouseButton1Click:Connect(...).',
    '- Close/cross buttons: set the main frame Visible = false.',
    '- Claim buttons: show a claimed state (e.g. set text) and print a reward hook placeholder.',
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
  return s
    .replace(/```lua\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

module.exports = router;
