-- ============================================================
-- Generator.lua — Bloxig v3.0
-- NEW: Full prefix system matching Figblox pipeline
--   .textbutton  → TextButton
--   .imagebutton → ImageButton
--   .scrollv     → ScrollingFrame (vertical)
--   .scrollh     → ScrollingFrame (horizontal)
--   .canvas      → CanvasGroup
--   .raster      → ImageLabel (linked by imageName)
--   .input       → TextBox
--   .viewport    → ViewportFrame
--   .ignore      → skip this node entirely
--   .parent      → this child becomes the real parent container
-- ============================================================

local ScaleConverter = require(script.Parent.ScaleConverter)

-- ── AI interaction wiring deps (NEW) ──────────────────────────
local HttpService = game:GetService("HttpService")
local BLOXIG_SERVER_URL = "https://bloxig.onrender.com"   -- same as Main.lua

local Generator = {}

Generator.VERSION = "3.0.0"

-- ── Safe math helpers ─────────────────────────────────────────
local function safeDivide(n, d)
	if not d or d == 0 then return 0 end
	return n / d
end

-- Step 2: use the Figma-known parent pixel size passed in, NOT AbsoluteSize.
-- AbsoluteSize is 0 in edit mode and reflects render size, not the Figma
-- reference we must scale against. Explicit dims are deterministic + correct.
local function resolveParentSize(parent, fallbackW, fallbackH)
	return math.max(1, fallbackW or 1280), math.max(1, fallbackH or 720)
end

local function safePosition(node, parent, fallbackW, fallbackH)
	local refW, refH = resolveParentSize(parent, fallbackW, fallbackH)
	local x = math.max(0, node.x or 0)
	local y = math.max(0, node.y or 0)
	if refW > 0 and refH > 0 then
		return UDim2.new(
			math.clamp(safeDivide(x, refW), 0, 10), 0,
			math.clamp(safeDivide(y, refH), 0, 10), 0
		)
	end
	return UDim2.new(0, x, 0, y)
end

local function safeSize(node, parent, fallbackW, fallbackH)
	local refW, refH = resolveParentSize(parent, fallbackW, fallbackH)
	local w = math.max(0, node.width  or 0)
	local h = math.max(0, node.height or 0)
	if refW > 0 and refH > 0 then
		return UDim2.new(
			math.clamp(safeDivide(w, refW), 0, 10), 0,
			math.clamp(safeDivide(h, refH), 0, 10), 0
		)
	end
	return UDim2.new(0, w, 0, h)
end

-- ════════════════════════════════════════════════════════════════
-- PREFIX PARSER
-- Reads node.prefixes (array from JSON) or falls back to
-- parsing raw node.rawName for legacy exports.
--
-- Returns a set: { textbutton=true, raster=true, ... }
-- ════════════════════════════════════════════════════════════════
local VALID_PREFIXES = {
	textbutton  = true,
	imagebutton = true,
	scrollv     = true,
	scrollh     = true,
	canvas      = true,
	grid        = true,
	raster      = true,
	input       = true,
	viewport    = true,
	ignore      = true,
	parent      = true,
}

local function parsePrefixes(node)
	local result = {}

	-- New v2.0 exports include prefixes array directly
	if node.prefixes and type(node.prefixes) == "table" then
		for _, p in ipairs(node.prefixes) do
			if VALID_PREFIXES[p] then
				result[p] = true
			end
		end
		return result
	end

	-- Fallback: parse from rawName or name
	local name = node.rawName or node.name or ""
	for part in name:gmatch("%S+") do
		if part:sub(1,1) == "." then
			local tag = part:sub(2):lower()
			if VALID_PREFIXES[tag] then
				result[tag] = true
			end
		else
			break -- stop at first non-prefix word
		end
	end

	return result
end

-- ── Font system ───────────────────────────────────────────────
local FONT_MAP = {
	["Inter"]           = Enum.Font.Gotham,
	["Roboto"]          = Enum.Font.Gotham,
	["Montserrat"]      = Enum.Font.GothamBold,
	["Open Sans"]       = Enum.Font.Gotham,
	["Nunito"]          = Enum.Font.Nunito,
	["Ubuntu"]          = Enum.Font.Ubuntu,
	["Arial"]           = Enum.Font.Arial,
	["Arial Bold"]      = Enum.Font.ArialBold,
	["Oswald"]          = Enum.Font.Oswald,
	["Fredoka One"]     = Enum.Font.FredokaOne,
	["Cartoon"]         = Enum.Font.Cartoon,
	["Code"]            = Enum.Font.Code,
	["Gotham"]          = Enum.Font.Gotham,
	["Gotham Medium"]   = Enum.Font.GothamMedium,
	["Gotham Bold"]     = Enum.Font.GothamBold,
	["Gotham Black"]    = Enum.Font.GothamBlack,
	["Source Sans Pro"] = Enum.Font.Gotham,
	["SourceSansPro"]   = Enum.Font.Gotham,
}

local function resolveFont(fontName)
	if not fontName or fontName == "" then
		return Font.fromEnum(Enum.Font.Gotham)
	end
	local mapped = FONT_MAP[fontName]
	if mapped then
		local ok, f = pcall(function() return Font.fromEnum(mapped) end)
		if ok then return f end
	end
	return Font.fromEnum(Enum.Font.Gotham)
end

-- ── Color helpers ─────────────────────────────────────────────
local function toColor3(fill)
	if not fill then return Color3.new(1,1,1) end
	return Color3.new(
		math.clamp(fill.r or 1, 0, 1),
		math.clamp(fill.g or 1, 0, 1),
		math.clamp(fill.b or 1, 0, 1)
	)
end

local function toTransparency(opacity)
	return 1 - math.clamp(opacity or 1, 0, 1)
end

local function buildAssetUrl(imageRef)
	if not imageRef then return "" end
	if tostring(imageRef):match("^rbxassetid://") then return imageRef end
	return "rbxassetid://" .. tostring(imageRef)
end

-- ── UIGradient ────────────────────────────────────────────────
local function applyGradient(parent, fill)
	if not fill or not fill.gradientStops or #fill.gradientStops == 0 then return end
	local stops = {}
	for _, s in ipairs(fill.gradientStops) do table.insert(stops, s) end
	table.sort(stops, function(a, b) return (a.position or 0) < (b.position or 0) end)
	if stops[1] then stops[1].position = 0 end
	if stops[#stops] then stops[#stops].position = 1 end

	local colorKeys, alphaKeys = {}, {}
	for _, stop in ipairs(stops) do
		local c   = stop.color or {}
		local pos = math.clamp(stop.position or 0, 0, 1)
		table.insert(colorKeys, ColorSequenceKeypoint.new(pos,
			Color3.new(
				math.clamp(c.r or 1, 0, 1),
				math.clamp(c.g or 1, 0, 1),
				math.clamp(c.b or 1, 0, 1)
			)
		))
		table.insert(alphaKeys, NumberSequenceKeypoint.new(pos,
			math.clamp(1 - (c.a or 1), 0, 1)
		))
	end

	if #colorKeys == 1 then
		table.insert(colorKeys, ColorSequenceKeypoint.new(1, colorKeys[1].Value))
		table.insert(alphaKeys,  NumberSequenceKeypoint.new(1, alphaKeys[1].Value))
	end

	local g = Instance.new("UIGradient")
	g.Color        = ColorSequence.new(colorKeys)
	g.Transparency = NumberSequence.new(alphaKeys)
	g.Rotation     = math.clamp(math.deg(fill.gradientAngle or 0), -360, 360)
	g.Parent       = parent
	return g
end

-- ── Fill ──────────────────────────────────────────────────────
local function applyFill(inst, node)
	if not node.fills or #node.fills == 0 then
		inst.BackgroundTransparency = 1
		return
	end
	local fill = node.fills[1]
	if fill.type == "SOLID" and fill.color then
		inst.BackgroundColor3       = toColor3(fill.color)
		inst.BackgroundTransparency = math.clamp(1 - (fill.color.a or 1), 0, 1)
	elseif fill.type == "GRADIENT_LINEAR" or fill.type == "GRADIENT_RADIAL" then
		inst.BackgroundColor3       = Color3.new(1,1,1)
		inst.BackgroundTransparency = 0
		applyGradient(inst, fill)
	else
		inst.BackgroundTransparency = 1
	end
	if node.opacity and node.opacity < 1 then
		local t = toTransparency(node.opacity)
		inst.BackgroundTransparency = math.max(inst.BackgroundTransparency, t)
	end
end

-- ── Text properties ───────────────────────────────────────────
local function applyTextProperties(inst, node)
	inst.Text        = node.characters or ""
	local figmaSize  = math.max(1, node.fontSize or 14)
	-- Option 3 fidelity: text scales WITH the UI (fills its box) but is capped at
	-- the original Figma size, so it matches the design on the design-size screen
	-- and scales down gracefully on smaller screens. No runtime script needed.
	inst.TextScaled  = true
	inst.TextWrapped = node.textWrapped ~= false
	inst.RichText    = node.richText or false
	local sizeConstraint = Instance.new("UITextSizeConstraint")
	sizeConstraint.MaxTextSize = figmaSize
	sizeConstraint.MinTextSize = 1
	sizeConstraint.Parent = inst

	local fontFamily = node.fontName and node.fontName.family or nil
	inst.FontFace    = resolveFont(fontFamily)

	local xAlign = node.textAlignHorizontal or "LEFT"
	if xAlign == "CENTER" then
		inst.TextXAlignment = Enum.TextXAlignment.Center
	elseif xAlign == "RIGHT" then
		inst.TextXAlignment = Enum.TextXAlignment.Right
	else
		inst.TextXAlignment = Enum.TextXAlignment.Left
	end

	local yAlign = node.textAlignVertical or "TOP"
	if yAlign == "CENTER" then
		inst.TextYAlignment = Enum.TextYAlignment.Center
	elseif yAlign == "BOTTOM" then
		inst.TextYAlignment = Enum.TextYAlignment.Bottom
	else
		inst.TextYAlignment = Enum.TextYAlignment.Top
	end

	if node.fills and #node.fills > 0 then
		local fill = node.fills[1]
		if fill.type == "SOLID" and fill.color then
			inst.TextColor3       = toColor3(fill.color)
			inst.TextTransparency = math.clamp(1-(fill.color.a or 1), 0, 1)
		end
	else
		inst.TextColor3       = Color3.new(1,1,1)
		inst.TextTransparency = 0
	end

	inst.BackgroundTransparency = 1
	inst.AutomaticSize          = Enum.AutomaticSize.None
	inst:SetAttribute("Figblox_LockedTextSize", figmaSize)
end

-- ── Decorators ────────────────────────────────────────────────
local function applyCorner(inst, node)
	if not node.cornerRadius or node.cornerRadius == 0 then return end
	local corner = Instance.new("UICorner")
	local ref    = math.max(1, math.min(node.width or 100, node.height or 100))
	corner.CornerRadius = UDim.new(math.clamp(safeDivide(node.cornerRadius, ref), 0, 0.5), 0)
	corner.Parent = inst
end

local STROKE_REF_WIDTH = 1280  -- design reference width for proportional strokes

local function applyStroke(inst, node, frameW)
	if not node.strokes or #node.strokes == 0 then return end
	local s      = node.strokes[1]
	local stroke = inst:FindFirstChildOfClass("UIStroke") or Instance.new("UIStroke")
	-- Scale thickness relative to the frame so borders keep their Figma proportion
	-- across screen sizes (a raw px value looks chunky when the UI scales up).
	local rawWeight = math.max(0, node.strokeWeight or 1)
	local refW      = math.max(1, frameW or STROKE_REF_WIDTH)
	local scaled    = (rawWeight / refW) * STROKE_REF_WIDTH
	stroke.Thickness       = math.max(0.5, scaled)
	stroke.LineJoinMode    = Enum.LineJoinMode.Round
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border

	-- Clear any prior gradient so re-imports don't stack duplicates on the stroke.
	local oldStrokeGrad = stroke:FindFirstChildOfClass("UIGradient")
	if oldStrokeGrad then oldStrokeGrad:Destroy() end

	if s.gradientStops and #s.gradientStops > 0 then
		-- GRADIENT stroke: Roblox renders a UIGradient parented to the UIStroke.
		-- White base so the gradient's own colors show true (not tinted).
		stroke.Color        = Color3.new(1, 1, 1)
		stroke.Transparency = 0
		applyGradient(stroke, s)   -- reuses the fill gradient builder; parents to the stroke
	elseif s.color then
		-- SOLID stroke.
		stroke.Color        = toColor3(s.color)
		stroke.Transparency = math.clamp(1 - (s.color.a or 1), 0, 1)
	end

	stroke.Parent = inst
end

local function applyPadding(inst, node, refW, refH)
	local hasP = node.paddingLeft or node.paddingTop or node.paddingRight or node.paddingBottom
	if not hasP then return end
	local pad = Instance.new("UIPadding")
	local safeW = math.max(1, refW)
	local safeH = math.max(1, refH)
	pad.PaddingLeft   = UDim.new(safeDivide(node.paddingLeft   or 0, safeW), 0)
	pad.PaddingRight  = UDim.new(safeDivide(node.paddingRight  or 0, safeW), 0)
	pad.PaddingTop    = UDim.new(safeDivide(node.paddingTop    or 0, safeH), 0)
	pad.PaddingBottom = UDim.new(safeDivide(node.paddingBottom or 0, safeH), 0)
	pad.Parent = inst
end

local function applyAspectRatio(inst, node)
	local w = node.width  or 0
	local h = node.height or 0
	if w <= 0 or h <= 0 then return end
	local arc        = Instance.new("UIAspectRatioConstraint")
	arc.AspectRatio  = math.clamp(safeDivide(w, h), 0.01, 100)
	arc.AspectType   = Enum.AspectType.FitWithinMaxSize
	arc.DominantAxis = Enum.DominantAxis.Width
	arc.Parent       = inst
end

local function applyLayout(inst, node)
	-- DISABLED (v3.1): Figma auto-layout (UIListLayout/UIGridLayout) is intentionally
	-- NOT applied. Our exporter already gives every child pixel-accurate, parent-
	-- relative positions, so re-running Roblox's layout engine here only FIGHTS those
	-- positions (a UIGridLayout in particular ignores Position entirely and crams
	-- children into fixed cells, scrambling the design). Positions are authoritative.
	--
	-- To support dynamic/reflowing lists later, we'd apply a UIListLayout ONLY for
	-- frames with layoutMode set AND skip setting child positions for those frames.
	-- That's a deliberate future feature, not the default.
	return
end

local function injectIdentity(inst, node)
	inst:SetAttribute("Figblox_ID",   node.id   or "")
	inst:SetAttribute("Figblox_Name", node.name or "")
	inst:SetAttribute("Figblox_Type", node.type or "FRAME")
	inst:SetAttribute("Figblox_Ver",  Generator.VERSION)
	-- Store imageName so Link Images can match later
	if node.imageName then
		inst:SetAttribute("Figblox_ImageName", node.imageName)
	end
	-- Store prefixes for debugging
	if node.prefixes and #node.prefixes > 0 then
		inst:SetAttribute("Figblox_Prefixes", table.concat(node.prefixes, ","))
	end
	-- Store STRUCTURE-BASED interactivity detection (from code.ts v1.5+).
	-- These let collectInteractive wire elements by inferred role, not name.
	if node.interactive then
		inst:SetAttribute("Bloxig_Interactive", true)
		inst:SetAttribute("Bloxig_RoleHint", node.roleHint or "generic")
		if node.uiContext then
			if node.uiContext.text  then inst:SetAttribute("Bloxig_CtxText",  node.uiContext.text)  end
			if node.uiContext.zoneX then inst:SetAttribute("Bloxig_CtxZoneX", node.uiContext.zoneX) end
			if node.uiContext.zoneY then inst:SetAttribute("Bloxig_CtxZoneY", node.uiContext.zoneY) end
			if node.uiContext.rowMember then inst:SetAttribute("Bloxig_CtxRow", true) end
		end
	end
end

-- ── Auto-grid: add a UIGridLayout to a scroll/grid container, sizing the
--    cell from the first child and the padding from the gap between the first
--    two children. Positions of children are then SKIPPED (grid flows them),
--    so runtime-cloned cards lay out automatically. This is the ONE place we
--    intentionally override pixel positions (a reflowing grid needs it).
local function applyAutoGrid(inst, node)
	local kids = node.children
	if not kids or #kids < 2 then return false end

	-- Cell size from the first child's pixel dims.
	local first = kids[1]
	local cw = math.max(1, first.width  or 100)
	local ch = math.max(1, first.height or 100)

	-- Padding from the gap between child 1 and child 2 (row or column).
	local second = kids[2]
	local padX, padY = 0, 0
	if first.x and second.x and first.y and second.y then
		local dx = math.abs((second.x or 0) - (first.x or 0))
		local dy = math.abs((second.y or 0) - (first.y or 0))
		-- horizontal neighbour -> gap is dx - cellW ; vertical -> dy - cellH
		if dx >= dy then
			padX = math.max(0, dx - cw)
		else
			padY = math.max(0, dy - ch)
		end
	end

	local grid = Instance.new("UIGridLayout")
	grid.CellSize    = UDim2.new(0, cw, 0, ch)
	grid.CellPadding = UDim2.new(0, padX, 0, padY)
	grid.SortOrder   = Enum.SortOrder.LayoutOrder
	grid.FillDirectionMaxCells = 0   -- wrap by container width
	grid.Parent = inst
	return true
end

-- ════════════════════════════════════════════════════════════════
-- CORE: createInstance
-- Now uses prefix table to decide class instead of guessing
-- ════════════════════════════════════════════════════════════════
function Generator.createInstance(node, parent, frameW, frameH)
	if not node then return nil end

	frameW = frameW or 1280
	frameH = frameH or 720

	-- ── Parse prefixes ────────────────────────────────────────
	local prefixes = parsePrefixes(node)

	-- Grid intent: explicit .grid, or a scroll container with 2+ children.
	-- (Auto so the user never has to tag it — matches the tool's automation goal.)
	local isGrid = prefixes.grid == true
	if not isGrid and (prefixes.scrollv or prefixes.scrollh)
	   and node.children and #node.children >= 2 then
		isGrid = true
	end
	if prefixes.grid and not prefixes.scrollv and not prefixes.scrollh then
		prefixes.scrollv = true   -- a bare .grid scrolls vertically by default
	end

	-- Skip nodes tagged .ignore
	if prefixes.ignore then
		return nil
	end

	local inst
	local nodeType  = node.type or "FRAME"
	local fills     = node.fills or {}
	local firstFill = fills[1]

	-- ════════════════════════════════════════════════════════
	-- CLASS DECISION — prefix takes priority over node type
	-- ════════════════════════════════════════════════════════

	-- .raster → ImageLabel linked by imageName
	if prefixes.raster or node.isRaster then
		inst = Instance.new("ImageLabel")
		inst.BackgroundTransparency = 1
		inst.ScaleType              = Enum.ScaleType.Stretch
		inst.ImageTransparency      = 0
		-- Image will be "" until Link Images runs
		-- The Figblox_ImageName attribute is what linking uses
		inst.Image = ""
		applyAspectRatio(inst, node)

	-- .textbutton → TextButton
	elseif prefixes.textbutton then
		inst = Instance.new("TextButton")
		inst.Active          = true
		inst.AutoButtonColor = false
		applyTextProperties(inst, node)
		applyFill(inst, node)

	-- .imagebutton → ImageButton
	elseif prefixes.imagebutton then
		inst = Instance.new("ImageButton")
		inst.Active               = true
		inst.AutoButtonColor      = false
		inst.BackgroundTransparency = 1
		inst.ScaleType            = Enum.ScaleType.Stretch
		inst.Image                = ""
		applyAspectRatio(inst, node)

	-- .scrollv → ScrollingFrame vertical
	elseif prefixes.scrollv then
		inst = Instance.new("ScrollingFrame")
		inst.ScrollBarThickness   = 4
		inst.ScrollingDirection   = Enum.ScrollingDirection.Y
		inst.AutomaticCanvasSize  = Enum.AutomaticSize.Y
		inst.CanvasSize           = UDim2.new(0, 0, 0, 0)
		inst.ScrollBarImageColor3 = Color3.fromRGB(180, 180, 180)
		applyFill(inst, node)

	-- .scrollh → ScrollingFrame horizontal
	elseif prefixes.scrollh then
		inst = Instance.new("ScrollingFrame")
		inst.ScrollBarThickness   = 4
		inst.ScrollingDirection   = Enum.ScrollingDirection.X
		inst.AutomaticCanvasSize  = Enum.AutomaticSize.X
		inst.CanvasSize           = UDim2.new(0, 0, 0, 0)
		inst.ScrollBarImageColor3 = Color3.fromRGB(180, 180, 180)
		applyFill(inst, node)

	-- .canvas → CanvasGroup (group with composite opacity)
	elseif prefixes.canvas then
		inst = Instance.new("CanvasGroup")
		inst.GroupTransparency  = toTransparency(node.opacity)
		inst.GroupColor3        = Color3.new(1,1,1)
		inst.BackgroundTransparency = 1

	-- .input → TextBox
	elseif prefixes.input then
		inst = Instance.new("TextBox")
		inst.PlaceholderText   = node.placeholderText or "Enter text..."
		inst.PlaceholderColor3 = Color3.fromRGB(150, 150, 150)
		inst.ClearTextOnFocus  = true
		inst.MultiLine         = false
		applyTextProperties(inst, node)
		applyFill(inst, node)

	-- .viewport → ViewportFrame
	elseif prefixes.viewport then
		inst = Instance.new("ViewportFrame")
		inst.BackgroundTransparency = 0
		inst.BackgroundColor3       = Color3.fromRGB(30, 30, 30)
		local cam    = Instance.new("Camera")
		cam.CFrame   = CFrame.new(0, 5, 10) * CFrame.Angles(-0.4, 0, 0)
		cam.Parent   = inst
		inst.CurrentCamera = cam

	-- ── Fallback: decide from node type ───────────────────────

	-- Scroll from overflow direction
	elseif nodeType == "FRAME" and node.overflowDirection and
	       node.overflowDirection ~= "NONE" then
		inst = Instance.new("ScrollingFrame")
		inst.ScrollBarThickness  = 4
		inst.AutomaticCanvasSize = node.overflowDirection == "HORIZONTAL"
			and Enum.AutomaticSize.X or Enum.AutomaticSize.Y
		inst.CanvasSize          = UDim2.new(0, 0, 0, 0)
		inst.ScrollBarImageColor3 = Color3.fromRGB(180, 180, 180)
		applyFill(inst, node)

	-- Group with opacity → CanvasGroup
	elseif nodeType == "GROUP" and node.opacity and node.opacity < 1 then
		inst = Instance.new("CanvasGroup")
		inst.GroupTransparency      = toTransparency(node.opacity)
		inst.GroupColor3            = Color3.new(1,1,1)
		inst.BackgroundTransparency = 1

	-- Text node
	elseif nodeType == "TEXT" then
		inst = Instance.new("TextLabel")
		applyTextProperties(inst, node)

	-- Image fill or vector node → ImageLabel
	elseif nodeType == "IMAGE" or nodeType == "VECTOR" or
	       (firstFill and firstFill.type == "IMAGE") then
		inst = Instance.new("ImageLabel")
		inst.BackgroundTransparency = 1
		inst.ScaleType              = Enum.ScaleType.Stretch
		inst.ImageTransparency      = toTransparency(node.opacity)
		inst.Image                  = ""
		applyAspectRatio(inst, node)

	-- Default → Frame
	else
		inst = Instance.new("Frame")
		-- Figma frames clip by default; honor exported clipsContent (default true)
		inst.ClipsDescendants = (node.clipsContent ~= false)
		applyFill(inst, node)
	end

	-- ── Common properties ─────────────────────────────────────
	-- Apply clipping to container types when Figma says so (frames clip by default)
	if inst:IsA("Frame") or inst:IsA("ScrollingFrame") or inst:IsA("CanvasGroup") then
		if node.clipsContent ~= nil then
			inst.ClipsDescendants = (node.clipsContent ~= false)
		end
	end
		inst.Name        = (node.name or "BloxigElement"):sub(1, 100)
	inst.Visible     = node.visible ~= false
	inst.ZIndex      = math.clamp(node.zIndex or 1, 1, 100)
	inst.AnchorPoint = Vector2.new(0, 0)
	-- If the parent is an auto-grid, DON'T set Position — UIGridLayout flows
	-- children by LayoutOrder. Setting Position would fight the layout.
	local parentIsGrid = parent and parent:GetAttribute("Bloxig_Grid") == true
	if parentIsGrid then
		inst.LayoutOrder = (node.zIndex or 1)
	else
		inst.Position = safePosition(node, parent, frameW, frameH)
	end
	inst.Size        = safeSize(node, parent, frameW, frameH)

	if node.rotation and node.rotation ~= 0 then
		inst.Rotation = math.clamp(node.rotation, -360, 360)
	end

	-- ── Decorators ────────────────────────────────────────────
	local refW, refH = resolveParentSize(parent, frameW, frameH)
	applyCorner(inst, node)
	applyStroke(inst, node, frameW)
	applyPadding(inst, node, refW, refH)
	applyLayout(inst, node)

	-- ── Identity ──────────────────────────────────────────────
	injectIdentity(inst, node)

	-- ── Auto-grid layout (before children so they flow into it) ───
	if isGrid and (inst:IsA("ScrollingFrame") or inst:IsA("Frame")) then
		applyAutoGrid(inst, node)
		inst:SetAttribute("Bloxig_Grid", true)
	end

	-- ── Parent LAST ───────────────────────────────────────────
	inst.Parent = parent

	-- ── Recurse children ──────────────────────────────────────
	-- .raster nodes don't have children (baked to one PNG)
	if node.children and not (prefixes.raster or node.isRaster) then
		-- Step 2 nesting fix: children scale against THIS node's Figma pixel
		-- size (their immediate parent), not the root frame size.
		local childRefW = math.max(1, node.width  or frameW)
		local childRefH = math.max(1, node.height or frameH)
		for _, childNode in ipairs(node.children) do
			Generator.createInstance(childNode, inst, childRefW, childRefH)
		end
	end

	return inst
end

-- ════════════════════════════════════════════════════════════════
-- PUBLIC: linkImages
-- After Roblox asset upload, call this to link uploaded decal IDs
-- to all ImageLabels/ImageButtons that have Figblox_ImageName set.
--
-- @param container   Instance  Root frame or ScreenGui
-- @param imageMap    table     { ["shopbackground_800x600"] = "rbxassetid://123456" }
-- ════════════════════════════════════════════════════════════════
function Generator.linkImages(container, imageMap)
	if not container or not imageMap then return 0 end

	local InsertService = game:GetService("InsertService")
	local resolveCache  = {}

	-- Open Cloud uploads images as DECAL assets. ImageLabel.Image needs the
	-- underlying IMAGE/texture id, NOT the decal wrapper id, or it renders BLANK.
	-- InsertService can load the decal (plugin can load assets the user owns) and
	-- expose its .Texture, which is the real content id we can assign.
	local function resolveToTexture(assetRef)
		local id = tostring(assetRef):match("%d+")
		if not id then return assetRef end           -- already a content string, pass through
		if resolveCache[id] then return resolveCache[id] end

		local ok, model = pcall(function()
			return InsertService:LoadAsset(tonumber(id))
		end)
		if ok and model then
			local decal = model:FindFirstChildWhichIsA("Decal", true)
			local tex   = decal and decal.Texture
			model:Destroy()
			if tex and tex ~= "" then
				resolveCache[id] = tex
				return tex
			end
		end

		-- Fallback: a freshly uploaded asset can fail to load for a few seconds
		-- until moderation clears. Use the rbxassetid form; the engine resolves
		-- some decals lazily, and a re-run of Link Images will fix the rest.
		local fallback = "rbxassetid://" .. id
		resolveCache[id] = fallback
		warn("[Bloxig] linkImages — could not resolve decal " .. id ..
			" to a texture yet (moderation pending?); using fallback id.")
		return fallback
	end

	local linked = 0
	local function scan(inst)
		local imageName = inst:GetAttribute("Figblox_ImageName")
		if imageName and imageMap[imageName] then
			if inst:IsA("ImageLabel") or inst:IsA("ImageButton") then
				inst.Image = resolveToTexture(imageMap[imageName])
				linked     = linked + 1
				inst:SetAttribute("Figblox_ImageLinked", true)
			end
		end
		for _, child in ipairs(inst:GetChildren()) do
			scan(child)
		end
	end

	scan(container)
	print(string.format("[Bloxig] linkImages — linked %d image(s)", linked))
	return linked
end

-- ════════════════════════════════════════════════════════════════
-- AI INTERACTION WIRING (NEW)
-- After the UI is built, ask the server (Gemma 4 via Fireworks) to write
-- the Luau that wires up the buttons/tabs/inputs, and attach it as a
-- LocalScript. Fails safe — never breaks the import if the AI call fails.
-- ════════════════════════════════════════════════════════════════

-- Names that signal an interactive element (FALLBACK only — used when the Figma
-- side didn't stamp structural detection, e.g. old exports or loose text).
local INTERACTIVE_PATTERNS = {
	"claim", "close", "cross", "redeem", "buy", "purchase", "shop",
	"confirm", "cancel", "play", "start", "next", "back", "exit",
	"submit", "tab", "button", "btn", "ok", "yes", "no", "select",
	"premium", "get", "unlock", "equip", "level", "tier",
}

local function nameLooksInteractive(name)
	local n = string.lower(name or "")
	for _, p in ipairs(INTERACTIVE_PATTERNS) do
		if string.find(n, p, 1, true) then return true end
	end
	return false
end

-- Map a name/text to a behavior hint (fallback when no structural roleHint).
local function intentHint(name)
	local n = string.lower(name or "")
	if n:find("close") or n:find("cross") or n == "x" or n == "button" or n:find("exit") then
		return "close"
	elseif n:find("claim") or n:find("redeem") or n:find("collect") then
		return "claim"
	elseif n:find("tab") or n:find("level") or n:find("tier") then
		return "tab"
	end
	return "generic"
end

-- Overlay a transparent, full-size clickable TextButton on a visible element so
-- it becomes clickable without touching the visuals. Returns the overlay.
local function overlayButton(inst, name)
	local btn = Instance.new("TextButton")
	btn.Name                   = name
	btn.Size                   = UDim2.fromScale(1, 1)
	btn.Position               = UDim2.fromScale(0, 0)
	btn.AnchorPoint            = Vector2.new(0, 0)
	btn.BackgroundTransparency = 1
	btn.Text                   = ""
	btn.ZIndex                 = 50
	btn.Active                 = true
	btn.Selectable             = true
	btn.Parent                 = inst
	return btn
end

-- HYBRID auto-detect. Three sources, all name-independent where possible:
--   1. Figma STRUCTURAL detection (Bloxig_Interactive attr, set by code.ts v1.5+)
--      — real buttons found by structure/position (e.g. a rasterized close btn).
--   2. Real Roblox buttons/inputs already in the tree (from prefixes).
--   3. Loose visible elements whose NAME looks interactive (fallback for text
--      tabs/claims that the Figma side left for us).
-- Each detected element gets a transparent overlay (so even baked images and
-- loose text become clickable) with a UNIQUE name and a role hint + context.
local function collectInteractive(root)
	local out  = {}
	local used = {}
	local seen = {}   -- instances already handled (dedup)

	local function uniqueName(base)
		local nm, i = base, 1
		while used[nm] do i = i + 1; nm = base .. i end
		used[nm] = true
		return nm
	end

	local function ctxOf(inst)
		return {
			text  = inst:GetAttribute("Bloxig_CtxText"),
			zoneX = inst:GetAttribute("Bloxig_CtxZoneX"),
			zoneY = inst:GetAttribute("Bloxig_CtxZoneY"),
			rowMember = inst:GetAttribute("Bloxig_CtxRow") or nil,
		}
	end

	local descendants = root:GetDescendants()

	for _, inst in ipairs(descendants) do
		if seen[inst] then
			-- already handled

		-- (1) STRUCTURAL detection from the Figma side ─────────────────
		elseif inst:GetAttribute("Bloxig_Interactive") then
			seen[inst] = true
			local role = inst:GetAttribute("Bloxig_RoleHint") or "generic"
			if inst:IsA("GuiButton") or inst:IsA("TextBox") then
				local nm = uniqueName(inst.Name)
				if nm ~= inst.Name then inst.Name = nm end
				table.insert(out, { name = nm, className = inst.ClassName, hint = role, context = ctxOf(inst) })
			elseif inst:IsA("GuiObject") then
				local nm = uniqueName(inst.Name .. "Click")
				overlayButton(inst, nm)
				table.insert(out, { name = nm, className = "TextButton", hint = role, context = ctxOf(inst) })
			end

		-- (2) already a real interactive instance ─────────────────────
		elseif inst:IsA("ImageButton") or inst:IsA("TextButton") or inst:IsA("TextBox") then
			seen[inst] = true
			local nm = uniqueName(inst.Name)
			if nm ~= inst.Name then inst.Name = nm end
			table.insert(out, { name = nm, className = inst.ClassName, hint = intentHint(nm) })

		-- (3) FALLBACK: loose visible element whose name looks interactive ─
		elseif (inst:IsA("TextLabel") or inst:IsA("Frame") or inst:IsA("ImageLabel"))
			and nameLooksInteractive(inst.Name) then
			seen[inst] = true
			local nm = uniqueName(inst.Name .. "Click")
			overlayButton(inst, nm)
			table.insert(out, { name = nm, className = "TextButton", hint = intentHint(inst.Name) })
		end
	end

	return out
end

function Generator.attachAIWiring(root)
	local elements = collectInteractive(root)
	if #elements == 0 then
		print("[Bloxig] No interactive elements; skipping AI wiring.")
		return
	end
	print("[Bloxig] Auto-detected " .. #elements .. " interactive element(s); asking AI to wire...")

	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = BLOXIG_SERVER_URL .. "/api/ai/wire",
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json" },
			Body = HttpService:JSONEncode({ elements = elements }),
		})
	end)

	if not ok then
		warn("[Bloxig] AI wiring request errored: " .. tostring(res))
		return
	end
	if not res.Success then
		warn("[Bloxig] AI wiring HTTP " .. tostring(res.StatusCode))
		return
	end

	local okDecode, payload = pcall(function()
		return HttpService:JSONDecode(res.Body)
	end)
	if not okDecode or not payload.luau or payload.luau == "" then
		warn("[Bloxig] AI wiring returned no code.")
		return
	end

	local ls = Instance.new("LocalScript")
	ls.Name = "BloxigInteractions"
	ls.Source = payload.luau        -- Studio plugins can set .Source
	ls.Parent = root
	print("[Bloxig] AI interaction script attached (" .. #elements .. " elements).")
end

-- ════════════════════════════════════════════════════════════════
-- PUBLIC: buildFromJSON
-- ════════════════════════════════════════════════════════════════
function Generator.buildFromJSON(payload, container)
	if not payload or not container then
		warn("[Bloxig Generator] buildFromJSON: nil payload or container")
		return nil
	end

	local frameW = math.max(1, payload.frame and payload.frame.width  or 1280)
	local frameH = math.max(1, payload.frame and payload.frame.height or 720)

--//NEW UPDATED  FRAME ////------Recent cloud

	-- Find or create the root frame (was previously referenced but never created,
	-- which threw "attempt to index nil with 'Name'" if anything called this path).
	local rootName = (payload.frame and payload.frame.name) or "BloxigRoot"
	local rootFrame = container:FindFirstChild(rootName)
	if not rootFrame then
		rootFrame = Instance.new("Frame")
		rootFrame.Parent = container
	end
	rootFrame:SetAttribute("Figblox_ID",   payload.frame and payload.frame.id or "root")
	rootFrame:SetAttribute("Figblox_Root", true)

	rootFrame.Name                   = (payload.frame and payload.frame.name or "BloxigRoot"):sub(1,100)
	rootFrame.AnchorPoint            = Vector2.new(0.5, 0.5)
	rootFrame.Position               = UDim2.fromScale(0.5, 0.5)
	rootFrame.Size                   = UDim2.fromScale(1, 1)
	rootFrame.BackgroundTransparency = 1
	rootFrame.ZIndex                 = 1
	local _arc = Instance.new("UIAspectRatioConstraint")
	_arc.AspectRatio  = math.max(0.01, frameW / frameH)
	_arc.AspectType   = Enum.AspectType.FitWithinMaxSize
	_arc.DominantAxis = Enum.DominantAxis.Width
	_arc.Parent       = rootFrame

	local created = 0
	if payload.nodes then
		for _, node in ipairs(payload.nodes) do
			local inst = Generator.createInstance(node, rootFrame, frameW, frameH)
			if inst then created = created + 1 end
		end
	end

	print(string.format("[Bloxig Generator v%s] Built %d nodes into '%s' (%dx%d)",
		Generator.VERSION, created, rootFrame.Name, frameW, frameH))

	Generator.attachAIWiring(rootFrame)   -- NEW: AI interaction wiring

	return rootFrame
end

-- ════════════════════════════════════════════════════════════════
-- PUBLIC: updateInstance (used by SmartMerge)
-- ════════════════════════════════════════════════════════════════
function Generator.updateInstance(inst, node, parent, frameW, frameH)
	if not inst or not node then return end

	frameW = frameW or 1280
	frameH = frameH or 720

	inst.Position = safePosition(node, parent, frameW, frameH)
	inst.Size     = safeSize(node, parent, frameW, frameH)
	inst.Visible  = node.visible ~= false

	if node.rotation then
		inst.Rotation = math.clamp(node.rotation, -360, 360)
	end

	if inst:IsA("Frame") or inst:IsA("CanvasGroup") or inst:IsA("ScrollingFrame") then
		applyFill(inst, node)
		local oldGrad = inst:FindFirstChildOfClass("UIGradient")
		if oldGrad then oldGrad:Destroy() end
		if node.fills and #node.fills > 0 then
			local fill = node.fills[1]
			if fill.type == "GRADIENT_LINEAR" or fill.type == "GRADIENT_RADIAL" then
				applyGradient(inst, fill)
			end
		end
	end

	if inst:IsA("TextLabel") or inst:IsA("TextButton") or inst:IsA("TextBox") then
		if node.characters ~= nil then inst.Text = node.characters end
		if node.fontSize then
			local fs = math.max(1, node.fontSize)
			inst.TextScaled = true
			local c = inst:FindFirstChildOfClass("UITextSizeConstraint")
				or Instance.new("UITextSizeConstraint")
			c.MaxTextSize = fs
			c.MinTextSize = 1
			c.Parent      = inst
			inst:SetAttribute("Figblox_LockedTextSize", fs)
		end
		if node.fills and #node.fills > 0 then
			local fill = node.fills[1]
			if fill.type == "SOLID" and fill.color then
				inst.TextColor3       = toColor3(fill.color)
				inst.TextTransparency = math.clamp(1-(fill.color.a or 1), 0, 1)
			end
		end
	end

	if inst:IsA("ImageLabel") or inst:IsA("ImageButton") then
		inst.ImageTransparency = toTransparency(node.opacity)
		-- Update imageName in case it changed
		if node.imageName then
			inst:SetAttribute("Figblox_ImageName", node.imageName)
		end
	end

	if node.cornerRadius then
		local corner = inst:FindFirstChildOfClass("UICorner")
		if not corner then corner = Instance.new("UICorner"); corner.Parent = inst end
		local ref = math.max(1, math.min(node.width or 100, node.height or 100))
		corner.CornerRadius = UDim.new(math.clamp(safeDivide(node.cornerRadius, ref), 0, 0.5), 0)
	end

	if node.strokes and #node.strokes > 0 then
		local s      = node.strokes[1]
		local stroke = inst:FindFirstChildOfClass("UIStroke")
		if not stroke then stroke = Instance.new("UIStroke"); stroke.Parent = inst end
		stroke.Thickness = math.max(0, node.strokeWeight or 1)

		-- Clear any prior gradient so re-imports don't stack duplicates.
		local oldStrokeGrad = stroke:FindFirstChildOfClass("UIGradient")
		if oldStrokeGrad then oldStrokeGrad:Destroy() end

		if s.gradientStops and #s.gradientStops > 0 then
			stroke.Color        = Color3.new(1, 1, 1)   -- white base so gradient shows true
			stroke.Transparency = 0
			applyGradient(stroke, s)                     -- gradient stroke (UIGradient child)
		elseif s.color then
			stroke.Color        = toColor3(s.color)
			stroke.Transparency = math.clamp(1-(s.color.a or 1), 0, 1)
		end
	end

	inst:SetAttribute("Figblox_Orphan", nil)
	inst:SetAttribute("Figblox_Name",   node.name or inst.Name)
end

return Generator
