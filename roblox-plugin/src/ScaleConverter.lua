-- ============================================================
-- ScaleConverter.lua — Bloxig v2.1 (FIXED)
--
-- FIX 1: toPosition / toSize now accept explicit frameW, frameH
--         so edit-mode (AbsoluteSize = 0) never falls back wrong.
-- FIX 2: Added lockText() — sets TextScaled=false, locks size.
-- FIX 3: Added lockStroke() — scales UIStroke relative to frame.
-- ============================================================

local ScaleConverter = {}

local FALLBACK_WIDTH  = 1280
local FALLBACK_HEIGHT = 720

-- ── Internal: resolve reference size ─────────────────────────
-- Priority:
--   1. Explicit frameW/frameH passed in  ← NEW (fixes edit mode)
--   2. parent.AbsoluteSize               (works only at runtime)
--   3. ScreenGui.AbsoluteSize            (runtime fallback)
--   4. FALLBACK constant                 (never crashes)
local function getReferenceSize(parent, frameW, frameH)
	-- ✅ FIX 1: Use explicit frame dims first — edit mode safe
	if frameW and frameH and frameW > 0 and frameH > 0 then
		return frameW, frameH
	end

	-- Try AbsoluteSize on direct parent (runtime only)
	if parent and parent:IsA("GuiObject") then
		local abs = parent.AbsoluteSize
		if abs.X > 0 and abs.Y > 0 then
			return abs.X, abs.Y
		end
	end

	-- Walk up the tree looking for a ScreenGui (runtime only)
	if parent then
		local current = parent
		while current do
			if current:IsA("ScreenGui") then
				local abs = current.AbsoluteSize
				if abs.X > 0 and abs.Y > 0 then
					return abs.X, abs.Y
				end
				break
			end
			local ok, nextParent = pcall(function() return current.Parent end)
			current = ok and nextParent or nil
		end
	end

	-- Ultimate fallback — never returns zero
	warn("[Bloxig] ScaleConverter: using fallback " .. FALLBACK_WIDTH .. "x" .. FALLBACK_HEIGHT)
	return FALLBACK_WIDTH, FALLBACK_HEIGHT
end

-- ── Public: toPosition ────────────────────────────────────────
-- @param px_x, px_y   Figma pixel position
-- @param parent       Roblox parent GuiObject
-- @param frameW/H     Explicit Figma frame dims (REQUIRED in edit mode)
function ScaleConverter.toPosition(px_x, px_y, parent, frameW, frameH)
	local refW, refH = getReferenceSize(parent, frameW, frameH)
	return UDim2.new(
		math.clamp((px_x or 0) / refW, 0, 10), 0,
		math.clamp((px_y or 0) / refH, 0, 10), 0
	)
end

-- ── Public: toSize ────────────────────────────────────────────
-- @param px_w, px_h   Figma pixel size
-- @param parent       Roblox parent GuiObject
-- @param frameW/H     Explicit Figma frame dims (REQUIRED in edit mode)
function ScaleConverter.toSize(px_w, px_h, parent, frameW, frameH)
	local refW, refH = getReferenceSize(parent, frameW, frameH)
	return UDim2.new(
		math.clamp((px_w or 0) / refW, 0, 10), 0,
		math.clamp((px_h or 0) / refH, 0, 10), 0
	)
end

-- ── Public: toUDim (1D — padding, radius) ────────────────────
function ScaleConverter.toUDim(px, refPx)
	if not refPx or refPx == 0 then refPx = FALLBACK_WIDTH end
	return UDim.new(px / refPx, 0)
end

-- ── Public: toColor3 ─────────────────────────────────────────
function ScaleConverter.toColor3(fill)
	if not fill then return Color3.new(1, 1, 1) end
	return Color3.new(
		math.clamp(fill.r or 1, 0, 1),
		math.clamp(fill.g or 1, 0, 1),
		math.clamp(fill.b or 1, 0, 1)
	)
end

-- ── Public: toTransparency ────────────────────────────────────
function ScaleConverter.toTransparency(opacity)
	return 1 - math.clamp(opacity or 1, 0, 1)
end

-- ── Public: toColorSequence ──────────────────────────────────
function ScaleConverter.toColorSequence(stops)
	if not stops or #stops == 0 then
		return ColorSequence.new(Color3.new(1, 1, 1))
	end

	local sorted = {}
	for _, s in ipairs(stops) do table.insert(sorted, s) end
	table.sort(sorted, function(a, b) return a.position < b.position end)

	sorted[1].position       = 0
	sorted[#sorted].position = 1

	local keypoints = {}
	for _, stop in ipairs(sorted) do
		local c = stop.color or {}
		table.insert(keypoints, ColorSequenceKeypoint.new(
			math.clamp(stop.position, 0, 1),
			Color3.new(
				math.clamp(c.r or 1, 0, 1),
				math.clamp(c.g or 1, 0, 1),
				math.clamp(c.b or 1, 0, 1)
			)
		))
	end

	if #keypoints == 1 then
		table.insert(keypoints, ColorSequenceKeypoint.new(1, keypoints[1].Value))
	end

	return ColorSequence.new(keypoints)
end

-- ── Public: toNumberSequence ─────────────────────────────────
function ScaleConverter.toNumberSequence(stops)
	if not stops or #stops == 0 then
		return NumberSequence.new(0)
	end

	local sorted = {}
	for _, s in ipairs(stops) do table.insert(sorted, s) end
	table.sort(sorted, function(a, b) return a.position < b.position end)
	sorted[1].position       = 0
	sorted[#sorted].position = 1

	local keypoints = {}
	for _, stop in ipairs(sorted) do
		local alpha = stop.color and stop.color.a or 1
		table.insert(keypoints, NumberSequenceKeypoint.new(
			math.clamp(stop.position, 0, 1),
			math.clamp(1 - alpha, 0, 1)
		))
	end

	if #keypoints == 1 then
		table.insert(keypoints, NumberSequenceKeypoint.new(1, keypoints[1].Value))
	end

	return NumberSequence.new(keypoints)
end

-- ════════════════════════════════════════════════════════════════
-- ✅ FIX 2: lockText()
-- Matches Figblox "Lock Text" behavior.
-- Sets TextScaled = false and locks TextSize to exact Figma px value.
-- Call this AFTER creating every TextLabel/TextButton/TextBox.
--
-- @param inst     TextLabel / TextButton / TextBox
-- @param node     Figma JSON node (needs node.fontSize)
-- @param frameH   Figma frame height (for size-relative locking)
-- ════════════════════════════════════════════════════════════════
function ScaleConverter.lockText(inst, node, frameH)
	if not inst then return end
	if not (inst:IsA("TextLabel") or inst:IsA("TextButton") or inst:IsA("TextBox")) then
		return
	end

	-- Lock: never auto-scale text — preserves designer's exact size
	inst.TextScaled = false

	-- Set exact pixel size from Figma
	local fontSize = math.max(1, node and node.fontSize or 14)
	inst.TextSize  = fontSize

	-- Store the locked size as an attribute for future SmartMerge updates
	inst:SetAttribute("Figblox_LockedTextSize", fontSize)

	-- AutomaticSize off — text box grows with content otherwise
	inst.AutomaticSize = Enum.AutomaticSize.None
end

-- ════════════════════════════════════════════════════════════════
-- ✅ FIX 3: lockStroke()
-- Matches Figblox "Lock Stroke" behavior.
-- Scales UIStroke.Thickness relative to the frame size so strokes
-- look consistent across different screen resolutions.
--
-- @param inst       GuiObject that has a UIStroke child
-- @param node       Figma JSON node (needs node.strokeWeight)
-- @param frameW     Figma frame width (reference axis for scaling)
-- ════════════════════════════════════════════════════════════════
function ScaleConverter.lockStroke(inst, node, frameW)
	if not inst or not node then return end
	if not node.strokes or #node.strokes == 0 then return end

	local stroke = inst:FindFirstChildOfClass("UIStroke")
	if not stroke then return end

	local rawWeight = math.max(0, node.strokeWeight or 1)
	local refW      = math.max(1, frameW or FALLBACK_WIDTH)

	-- Scale stroke relative to frame width (same axis Figblox uses)
	-- This keeps a 2px stroke on a 1280px frame looking the same
	-- on any screen, instead of being a fixed pixel blob.
	local scaledThickness = (rawWeight / refW) * FALLBACK_WIDTH

	stroke.Thickness = math.max(0.5, scaledThickness)

	-- Store original for reference
	inst:SetAttribute("Figblox_LockedStroke", rawWeight)
end

return ScaleConverter