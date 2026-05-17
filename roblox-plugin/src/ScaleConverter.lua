-- ============================================================
-- ScaleConverter.lua
-- Bloxig Roblox Plugin — Requirement 1
--
-- Converts Figma pixel values → UDim2 Scale using the
-- parent's AbsoluteSize. Falls back to ScreenGui size
-- if parent is not yet in the tree (so elements never vanish).
-- ============================================================

local ScaleConverter = {}

-- ── Constants ────────────────────────────────────────────────
-- Fallback resolution if we cannot find a ScreenGui.
-- Matches the most common Roblox default viewport.
local FALLBACK_WIDTH  = 1280
local FALLBACK_HEIGHT = 720

-- ── Internal: resolve reference size ─────────────────────────
-- Priority order:
--   1. parent.AbsoluteSize  (most accurate — real rendered size)
--   2. ScreenGui.AbsoluteSize  (root container size)
--   3. FALLBACK constant  (safe default, never crashes)
local function getReferenceSize(parent)
	-- Try AbsoluteSize on the direct parent first
	if parent and parent:IsA("GuiObject") then
		local abs = parent.AbsoluteSize
		if abs.X > 0 and abs.Y > 0 then
			return abs.X, abs.Y
		end
	end

	-- Walk up the tree looking for a ScreenGui
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
			-- pcall in case Parent is locked (e.g. DataModel root)
			local ok, nextParent = pcall(function() return current.Parent end)
			current = ok and nextParent or nil
		end
	end

	-- Ultimate fallback — never returns zero
	warn("[Bloxig] ScaleConverter: could not resolve parent size, using fallback "
		.. FALLBACK_WIDTH .. "x" .. FALLBACK_HEIGHT)
	return FALLBACK_WIDTH, FALLBACK_HEIGHT
end

-- ── Public: toPosition ────────────────────────────────────────
-- Converts Figma x,y (pixels from top-left of parent frame)
-- → UDim2 using Scale, with Offset = 0.
--
-- @param px_x   number  Figma X position in pixels
-- @param px_y   number  Figma Y position in pixels
-- @param parent Instance  The Roblox parent GuiObject
-- @return UDim2
function ScaleConverter.toPosition(px_x, px_y, parent)
	local refW, refH = getReferenceSize(parent)
	return UDim2.new(
		px_x / refW, 0,
		px_y / refH, 0
	)
end

-- ── Public: toSize ────────────────────────────────────────────
-- Converts Figma width,height (pixels) → UDim2 Scale.
--
-- @param px_w   number  Figma width in pixels
-- @param px_h   number  Figma height in pixels
-- @param parent Instance  The Roblox parent GuiObject
-- @return UDim2
function ScaleConverter.toSize(px_w, px_h, parent)
	local refW, refH = getReferenceSize(parent)
	return UDim2.new(
		px_w / refW, 0,
		px_h / refH, 0
	)
end

-- ── Public: toUDim (1D — for padding, stroke, radius) ────────
-- Converts a single pixel value to a UDim Scale along one axis.
--
-- @param px     number  Pixel value
-- @param refPx  number  Reference axis size in pixels
-- @return UDim
function ScaleConverter.toUDim(px, refPx)
	if not refPx or refPx == 0 then refPx = FALLBACK_WIDTH end
	return UDim.new(px / refPx, 0)
end

-- ── Public: toColor3 ─────────────────────────────────────────
-- Converts a Figma RGBA fill {r,g,b,a} → Color3.
-- All channels are 0-1 floats as exported by the Figma plugin.
--
-- @param fill  table  { r=number, g=number, b=number, a=number }
-- @return Color3
function ScaleConverter.toColor3(fill)
	if not fill then return Color3.new(1, 1, 1) end
	return Color3.new(
		math.clamp(fill.r or 1, 0, 1),
		math.clamp(fill.g or 1, 0, 1),
		math.clamp(fill.b or 1, 0, 1)
	)
end

-- ── Public: toTransparency ────────────────────────────────────
-- Figma opacity (0-1) → Roblox Transparency (0-1, inverted).
--
-- @param opacity  number  Figma opacity (1 = fully opaque)
-- @return number  Roblox BackgroundTransparency
function ScaleConverter.toTransparency(opacity)
	return 1 - math.clamp(opacity or 1, 0, 1)
end

-- ── Public: toColorSequence ──────────────────────────────────
-- Converts a Figma gradient stop array → ColorSequence.
-- Supports 2 to 4 stops (anime-grade gradient fidelity).
--
-- Figma stop format: { position=number(0-1), color={r,g,b,a} }
--
-- @param stops  table  Array of gradient stop tables
-- @return ColorSequence
function ScaleConverter.toColorSequence(stops)
	if not stops or #stops == 0 then
		return ColorSequence.new(Color3.new(1, 1, 1))
	end

	-- Sort by position ascending (Figma doesn't guarantee order)
	local sorted = {}
	for _, s in ipairs(stops) do
		table.insert(sorted, s)
	end
	table.sort(sorted, function(a, b) return a.position < b.position end)

	-- Clamp first/last stop to exactly 0 and 1 (Roblox requirement)
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

	-- Safety: ColorSequence needs at least 2 keypoints
	if #keypoints == 1 then
		table.insert(keypoints, ColorSequenceKeypoint.new(1, keypoints[1].Value))
	end

	return ColorSequence.new(keypoints)
end

-- ── Public: toNumberSequence ─────────────────────────────────
-- Converts gradient alpha stops → NumberSequence for UIGradient.Transparency
--
-- @param stops  table  Array of { position=number, color={r,g,b,a} }
-- @return NumberSequence
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
			math.clamp(1 - alpha, 0, 1) -- Roblox is Transparency, not Alpha
		))
	end

	if #keypoints == 1 then
		table.insert(keypoints, NumberSequenceKeypoint.new(1, keypoints[1].Value))
	end

	return NumberSequence.new(keypoints)
end

return ScaleConverter