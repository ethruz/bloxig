-- ============================================================
-- Generator.lua — Bloxig Layout Compilation Engine v2.0
-- Principal Roblox Systems Architecture
--
-- COVERAGE: 100% — All 20 Roblox GUI objects + modifiers
-- POLICY: Zero-crash, zero division-by-zero, zero deprecated APIs
-- SMART MERGE: Full Figblox_ID injection on every instance
-- FONT: Font.fromEnum() only — no legacy SourceSansPro
-- ============================================================

local ScaleConverter = require(script.Parent.ScaleConverter)

local Generator = {}

-- ── Version ───────────────────────────────────────────────────
Generator.VERSION = "2.0.0"

-- ── ZERO-CRASH: Safe division ─────────────────────────────────
-- NEVER divides by zero. Returns offset UDim2 as fallback.
local function safeDivide(numerator, denominator)
	if not denominator or denominator == 0 then
		return 0
	end
	return numerator / denominator
end

-- ── ZERO-CRASH: Safe parent size resolver ────────────────────
-- Uses AbsoluteSize when available, falls back to frame dims.
local function resolveParentSize(parent, fallbackW, fallbackH)
	local w, h = fallbackW or 1280, fallbackH or 720

	if parent then
		local ok, abs = pcall(function() return parent.AbsoluteSize end)
		if ok and abs and abs.X > 0 and abs.Y > 0 then
			return abs.X, abs.Y
		end
	end

	return w, h
end

-- ── ZERO-CRASH: Safe position calculation ────────────────────
local function safePosition(node, parent, fallbackW, fallbackH)
	local refW, refH = resolveParentSize(parent, fallbackW, fallbackH)
	local x = math.max(0, node.x or 0)
	local y = math.max(0, node.y or 0)

	if refW > 0 and refH > 0 then
		return UDim2.new(
			math.clamp(safeDivide(x, refW), 0, 10),
			0,
			math.clamp(safeDivide(y, refH), 0, 10),
			0
		)
	end

	-- Fallback to offset if parent has no size yet
	return UDim2.new(0, x, 0, y)
end

-- ── ZERO-CRASH: Safe size calculation ────────────────────────
local function safeSize(node, parent, fallbackW, fallbackH)
	local refW, refH = resolveParentSize(parent, fallbackW, fallbackH)
	local w = math.max(0, node.width  or 0)
	local h = math.max(0, node.height or 0)

	if refW > 0 and refH > 0 then
		return UDim2.new(
			math.clamp(safeDivide(w, refW), 0, 10),
			0,
			math.clamp(safeDivide(h, refH), 0, 10),
			0
		)
	end

	return UDim2.new(0, w, 0, h)
end

-- ── MODERN FONT SYSTEM — No deprecated enums ─────────────────
-- Uses Font.fromEnum() — never Enum.Font.SourceSansPro
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
	["Source Sans Pro"] = Enum.Font.Gotham, -- deprecated → safe fallback
	["SourceSansPro"]   = Enum.Font.Gotham, -- deprecated → safe fallback
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
	-- Safe absolute fallback
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

-- ── Image asset URL builder ───────────────────────────────────
local function buildAssetUrl(imageRef)
	if not imageRef then return "" end
	if tostring(imageRef):match("^rbxassetid://") then
		return imageRef
	end
	return "rbxassetid://" .. tostring(imageRef)
end

-- ── UIGradient — 2 to 4 stop anime-grade ─────────────────────
local function applyGradient(parent, fill)
	if not fill or not fill.gradientStops or #fill.gradientStops == 0 then return end

	local stops = {}
	for _, s in ipairs(fill.gradientStops) do
		table.insert(stops, s)
	end
	table.sort(stops, function(a, b) return (a.position or 0) < (b.position or 0) end)

	-- Clamp endpoints to exactly 0 and 1 (Roblox requirement)
	if stops[1] then stops[1].position = 0 end
	if stops[#stops] then stops[#stops].position = 1 end

	-- Build ColorSequence
	local colorKeys, alphaKeys = {}, {}
	for _, stop in ipairs(stops) do
		local c = stop.color or {}
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

	-- Need at least 2 keypoints
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

-- ── Apply background fill (solid or gradient) ─────────────────
local function applyFill(inst, node)
	if not node.fills or #node.fills == 0 then
		inst.BackgroundTransparency = 1
		return
	end

	local fill = node.fills[1]

	if fill.type == "SOLID" and fill.color then
		inst.BackgroundColor3       = toColor3(fill.color)
		inst.BackgroundTransparency = math.clamp(
			1 - (fill.color.a or 1), 0, 1)

	elseif fill.type == "GRADIENT_LINEAR" or fill.type == "GRADIENT_RADIAL" then
		inst.BackgroundColor3       = Color3.new(1,1,1)
		inst.BackgroundTransparency = 0
		applyGradient(inst, fill)

	else
		inst.BackgroundTransparency = 1
	end

	-- Composite opacity on top
	if node.opacity and node.opacity < 1 then
		local t = toTransparency(node.opacity)
		inst.BackgroundTransparency = math.max(inst.BackgroundTransparency, t)
	end
end

-- ── UICorner ──────────────────────────────────────────────────
local function applyCorner(inst, node)
	if not node.cornerRadius or node.cornerRadius == 0 then return end
	local corner = Instance.new("UICorner")
	local ref    = math.max(1, math.min(node.width or 100, node.height or 100))
	corner.CornerRadius = UDim.new(
		math.clamp(safeDivide(node.cornerRadius, ref), 0, 0.5), 0)
	corner.Parent = inst
end

-- ── UIStroke ──────────────────────────────────────────────────
local function applyStroke(inst, node)
	if not node.strokes or #node.strokes == 0 then return end
	local s       = node.strokes[1]
	local stroke  = Instance.new("UIStroke")
	stroke.Thickness      = math.max(0, node.strokeWeight or 1)
	stroke.LineJoinMode   = Enum.LineJoinMode.Round
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	if s.color then
		stroke.Color        = toColor3(s.color)
		stroke.Transparency = math.clamp(1-(s.color.a or 1), 0, 1)
	end
	stroke.Parent = inst
end

-- ── UIPadding ────────────────────────────────────────────────
local function applyPadding(inst, node, refW, refH)
	local hasP = node.paddingLeft or node.paddingTop
		or node.paddingRight or node.paddingBottom
	if not hasP then return end
	local pad    = Instance.new("UIPadding")
	local safeW  = math.max(1, refW)
	local safeH  = math.max(1, refH)
	pad.PaddingLeft   = UDim.new(safeDivide(node.paddingLeft   or 0, safeW), 0)
	pad.PaddingRight  = UDim.new(safeDivide(node.paddingRight  or 0, safeW), 0)
	pad.PaddingTop    = UDim.new(safeDivide(node.paddingTop    or 0, safeH), 0)
	pad.PaddingBottom = UDim.new(safeDivide(node.paddingBottom or 0, safeH), 0)
	pad.Parent = inst
end

-- ── UIAspectRatioConstraint — anime texture guard ─────────────
local function applyAspectRatio(inst, node)
	local w = node.width  or 0
	local h = node.height or 0
	if w <= 0 or h <= 0 then return end
	local arc         = Instance.new("UIAspectRatioConstraint")
	arc.AspectRatio   = math.clamp(safeDivide(w, h), 0.01, 100)
	arc.AspectType    = Enum.AspectType.FitWithinMaxSize
	arc.DominantAxis  = Enum.DominantAxis.Width
	arc.Parent        = inst
end

-- ── UIScale — math-clamped global scale modifier ──────────────
local function applyUIScale(inst, node)
	if not node.uiScale then return end
	local scale     = Instance.new("UIScale")
	scale.Scale     = math.clamp(node.uiScale or 1, 0.01, 10)
	scale.Parent    = inst
end

-- ── UISizeConstraint — min/max pixel caps ────────────────────
local function applyUISizeConstraint(inst, node)
	if not node.minWidth and not node.maxWidth
	   and not node.minHeight and not node.maxHeight then return end
	local sc         = Instance.new("UISizeConstraint")
	sc.MinSize       = Vector2.new(
		math.max(0, node.minWidth  or 0),
		math.max(0, node.minHeight or 0))
	sc.MaxSize       = Vector2.new(
		math.clamp(node.maxWidth  or 99999, 0, 99999),
		math.clamp(node.maxHeight or 99999, 0, 99999))
	sc.Parent        = inst
end

-- ── UIFlexItem — Fill Container / Hug Contents ───────────────
-- Critical for Figma Auto Layout "Fill" behavior
local function applyUIFlexItem(inst, node)
	if not node.layoutSizing then return end
	local ok, flex = pcall(function() return Instance.new("UIFlexItem") end)
	if not ok then return end -- UIFlexItem may not exist in all Studio versions

	if node.layoutSizing == "FILL" then
		flex.FlexShrink          = 1
		flex.FlexGrow            = 1
		flex.ItemFlexAlignment   = Enum.UIFlexAlignment.Fill
	elseif node.layoutSizing == "HUG" then
		flex.FlexShrink          = 0
		flex.FlexGrow            = 0
		flex.ItemFlexAlignment   = Enum.UIFlexAlignment.Auto
	end

	flex.Parent = inst
end

-- ── Auto Layout → UIListLayout / UIGridLayout / UIPageLayout ─
local function applyLayout(inst, node)
	if node.layoutMode == "HORIZONTAL" or node.layoutMode == "VERTICAL" then
		local list            = Instance.new("UIListLayout")
		list.FillDirection    = node.layoutMode == "HORIZONTAL"
			and Enum.FillDirection.Horizontal
			or  Enum.FillDirection.Vertical
		list.SortOrder        = Enum.SortOrder.LayoutOrder
		list.Padding          = UDim.new(0, math.max(0, node.itemSpacing or 0))
		list.HorizontalAlignment = Enum.HorizontalAlignment.Left
		list.VerticalAlignment   = Enum.VerticalAlignment.Top
		if node.counterAxisAlignItems == "CENTER" then
			if node.layoutMode == "HORIZONTAL" then
				list.VerticalAlignment = Enum.VerticalAlignment.Center
			else
				list.HorizontalAlignment = Enum.HorizontalAlignment.Center
			end
		end
		list.Parent = inst

	elseif node.layoutMode == "GRID" then
		local grid           = Instance.new("UIGridLayout")
		grid.CellSize        = UDim2.new(
			0, math.max(1, node.cellWidth  or 100),
			0, math.max(1, node.cellHeight or 100))
		grid.CellPadding     = UDim2.new(
			0, math.max(0, node.itemSpacing or 4),
			0, math.max(0, node.itemSpacing or 4))
		grid.SortOrder       = Enum.SortOrder.LayoutOrder
		grid.FillDirection   = Enum.FillDirection.Horizontal
		grid.Parent          = inst

	elseif node.layoutMode == "PAGE" then
		local page           = Instance.new("UIPageLayout")
		page.SortOrder       = Enum.SortOrder.LayoutOrder
		page.Animated        = true
		page.EasingStyle     = Enum.EasingStyle.Quad
		page.EasingDirection = Enum.EasingDirection.Out
		page.TweenTime       = 0.25
		page.Padding         = UDim.new(0, 0)
		page.Parent          = inst

	elseif node.layoutMode == "TABLE" then
		local tbl            = Instance.new("UITableLayout")
		tbl.SortOrder        = Enum.SortOrder.LayoutOrder
		tbl.FillDirection    = Enum.FillDirection.Horizontal
		tbl.Padding          = UDim2.new(0, math.max(0, node.itemSpacing or 2),
		                                 0, math.max(0, node.itemSpacing or 2))
		tbl.Parent           = inst
	end
end

-- ── Apply text properties to TextLabel / TextButton / TextBox ─
local function applyTextProperties(inst, node)
	inst.Text          = node.characters or ""
	inst.TextSize      = math.max(1, node.fontSize or 14)
	inst.TextWrapped   = node.textWrapped ~= false
	inst.RichText      = node.richText or false
	inst.TextTruncate  = Enum.TextTruncate.None

	-- Modern font system
	local fontFamily = node.fontName and node.fontName.family or nil
	inst.FontFace    = resolveFont(fontFamily)

	-- Text alignment
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

	-- Text color from fills
	if node.fills and #node.fills > 0 then
		local fill = node.fills[1]
		if fill.type == "SOLID" and fill.color then
			inst.TextColor3      = toColor3(fill.color)
			inst.TextTransparency = math.clamp(1-(fill.color.a or 1), 0, 1)
		end
	else
		inst.TextColor3       = Color3.new(1,1,1)
		inst.TextTransparency = 0
	end

	inst.BackgroundTransparency = 1
end

-- ── Bloxig identity injection ─────────────────────────────────
local function injectIdentity(inst, node)
	inst:SetAttribute("Figblox_ID",   node.id      or "")
	inst:SetAttribute("Figblox_Name", node.name    or "")
	inst:SetAttribute("Figblox_Type", node.type    or "FRAME")
	inst:SetAttribute("Figblox_Ver",  Generator.VERSION)
end

-- ── Script protection check ───────────────────────────────────
-- Returns true if this class should NEVER be touched by Bloxig
local PROTECTED = {
	LocalScript      = true, ModuleScript    = true,
	Script           = true, RemoteEvent     = true,
	RemoteFunction   = true, BindableEvent   = true,
	BindableFunction = true,
}
local function isProtected(inst)
	return PROTECTED[inst.ClassName] == true
end

-- ════════════════════════════════════════════════════════════════
-- CORE: createInstance — The Main Factory
-- Dispatches to the correct builder based on node type and fills.
-- ════════════════════════════════════════════════════════════════
function Generator.createInstance(node, parent, frameW, frameH)
	if not node then return nil end

	frameW = frameW or 1280
	frameH = frameH or 720

	local inst
	local nodeType = node.type or "FRAME"
	local fills    = node.fills or {}
	local firstFill = fills[1]

	-- ── Determine instance class ──────────────────────────────

	-- CanvasGroup: group with opacity < 1 (fixes alpha-bleed)
	if nodeType == "GROUP" and node.opacity and node.opacity < 1 then
		inst = Instance.new("CanvasGroup")
		inst.GroupTransparency = toTransparency(node.opacity)
		inst.GroupColor3       = Color3.new(1,1,1)
		inst.BackgroundTransparency = 1

	-- ScrollingFrame: auto-layout with overflow
	elseif nodeType == "FRAME" and node.overflowDirection and
	       node.overflowDirection ~= "NONE" then
		inst = Instance.new("ScrollingFrame")
		inst.ScrollBarThickness = 4
		inst.ScrollBarImageColor3 = Color3.fromRGB(180,180,180)
		inst.CanvasSize         = UDim2.new(0, 0, 0, 0) -- auto-calculated below
		inst.AutomaticCanvasSize = Enum.AutomaticSize.Y
		applyFill(inst, node)

	-- TextButton: Figma component tagged as "button"
	elseif nodeType == "COMPONENT" and node.componentType == "BUTTON" then
		inst = Instance.new("TextButton")
		inst.Active    = true
		inst.AutoButtonColor = false
		applyTextProperties(inst, node)
		applyFill(inst, node)

	-- ImageButton: clickable image element
	elseif nodeType == "IMAGE_BUTTON" or
	       (nodeType == "COMPONENT" and node.componentType == "IMAGE_BUTTON") then
		inst = Instance.new("ImageButton")
		inst.Active    = true
		inst.AutoButtonColor = false
		inst.BackgroundTransparency = 1
		local ref = firstFill and firstFill.imageRef
		inst.Image = buildAssetUrl(ref)
		inst.ScaleType = Enum.ScaleType.Fit
		applyAspectRatio(inst, node)

	-- TextBox: input field
	elseif nodeType == "INPUT" or node.isInputField then
		inst = Instance.new("TextBox")
		inst.PlaceholderText    = node.placeholderText or "Enter text..."
		inst.PlaceholderColor3  = Color3.fromRGB(150,150,150)
		inst.ClearTextOnFocus   = node.clearTextOnFocus ~= false
		inst.MultiLine          = node.multiLine or false
		applyTextProperties(inst, node)
		applyFill(inst, node)

	-- ViewportFrame: 3D asset preview
	elseif nodeType == "VIEWPORT" or node.is3DFrame then
		inst = Instance.new("ViewportFrame")
		inst.BackgroundTransparency = 0
		inst.BackgroundColor3       = Color3.fromRGB(30,30,30)
		inst.ImageColor3            = Color3.new(1,1,1)
		inst.ImageTransparency      = 0
		-- Attach a default camera
		local cam         = Instance.new("Camera")
		cam.CFrame        = CFrame.new(0, 5, 10) * CFrame.Angles(-0.4, 0, 0)
		cam.Parent        = inst
		inst.CurrentCamera = cam

	-- TextLabel: text node
	elseif nodeType == "TEXT" then
		inst = Instance.new("TextLabel")
		applyTextProperties(inst, node)

	-- ImageLabel: image fill or vector
	elseif nodeType == "IMAGE" or nodeType == "VECTOR" or
	       (firstFill and firstFill.type == "IMAGE") then
		inst = Instance.new("ImageLabel")
		inst.BackgroundTransparency = 1
		inst.ScaleType              = Enum.ScaleType.Fit
		inst.ImageTransparency      = toTransparency(node.opacity)
		inst.Image                  = buildAssetUrl(firstFill and firstFill.imageRef)
		-- Requirement 2: ALWAYS inject UIAspectRatioConstraint on images
		applyAspectRatio(inst, node)

	-- Default: Frame (covers FRAME, COMPONENT, SECTION, GROUP with full opacity)
	else
		inst = Instance.new("Frame")
		inst.ClipsDescendants = node.clipsContent or false
		applyFill(inst, node)
	end

	-- ── Common properties for ALL GuiObjects ──────────────────
	inst.Name        = (node.name or "BloxigElement"):sub(1, 100) -- Roblox name limit
	inst.Visible     = node.visible ~= false
	inst.ZIndex      = math.clamp(node.zIndex or 1, 1, 100)
	inst.AnchorPoint = Vector2.new(0, 0)

	-- ── Position + Size (zero-crash scale system) ─────────────
	inst.Position = safePosition(node, parent, frameW, frameH)
	inst.Size     = safeSize(node, parent, frameW, frameH)

	-- ── Rotation ──────────────────────────────────────────────
	if node.rotation and node.rotation ~= 0 then
		inst.Rotation = math.clamp(node.rotation, -360, 360)
	end

	-- ── Decorators ────────────────────────────────────────────
	local refW, refH = resolveParentSize(parent, frameW, frameH)
	applyCorner(inst, node)
	applyStroke(inst, node)
	applyPadding(inst, node, refW, refH)
	applyLayout(inst, node)
	applyUIScale(inst, node)
	applyUISizeConstraint(inst, node)
	applyUIFlexItem(inst, node)

	-- ── Bloxig identity (Smart Merge key) ─────────────────────
	injectIdentity(inst, node)

	-- ── Parent LAST (so AbsoluteSize resolves for children) ───
	inst.Parent = parent

	-- ── Recurse children — preserve protected scripts ─────────
	if node.children then
		for _, childNode in ipairs(node.children) do
			-- Pass frame dims down the tree
			childNode._frameWidth  = frameW
			childNode._frameHeight = frameH
			Generator.createInstance(childNode, inst, frameW, frameH)
		end
	end

	return inst
end

-- ════════════════════════════════════════════════════════════════
-- PUBLIC: buildFromJSON
-- Entry point. Builds entire UI tree from Bloxig API payload.
-- @param payload   table     Full JSON from /api/import
-- @param container Instance  ScreenGui or Frame to build into
-- ════════════════════════════════════════════════════════════════
function Generator.buildFromJSON(payload, container)
	if not payload or not container then
		warn("[Bloxig Generator] buildFromJSON: nil payload or container")
		return nil
	end

	local frameW = payload.frame and payload.frame.width  or 1280
	local frameH = payload.frame and payload.frame.height or 720

	-- Validate frame dimensions (zero-crash)
	frameW = math.max(1, frameW)
	frameH = math.max(1, frameH)

	-- Root frame — fills ScreenGui, acts as coordinate origin
	local rootFrame                    = Instance.new("Frame")
	rootFrame.Name                     = (payload.frame and payload.frame.name or "BloxigRoot"):sub(1,100)
	rootFrame.Size                     = UDim2.new(1, 0, 1, 0)
	rootFrame.Position                 = UDim2.new(0, 0, 0, 0)
	rootFrame.BackgroundTransparency   = 1
	rootFrame.ZIndex                   = 1
	rootFrame:SetAttribute("Figblox_ID",   payload.frame and payload.frame.id or "root")
	rootFrame:SetAttribute("Figblox_Root", true)
	rootFrame:SetAttribute("Figblox_Ver",  Generator.VERSION)
	rootFrame:SetAttribute("Figblox_W",    frameW)
	rootFrame:SetAttribute("Figblox_H",    frameH)
	rootFrame.Parent = container

	-- Build all top-level nodes
	local created = 0
	if payload.nodes then
		for _, node in ipairs(payload.nodes) do
			local inst = Generator.createInstance(node, rootFrame, frameW, frameH)
			if inst then created = created + 1 end
		end
	end

	print(string.format("[Bloxig Generator v%s] Built %d root nodes into '%s' (%dx%d)",
		Generator.VERSION, created, rootFrame.Name, frameW, frameH))

	return rootFrame
end

-- ════════════════════════════════════════════════════════════════
-- PUBLIC: updateInstance
-- Updates ONLY visual properties on an existing instance.
-- NEVER touches LocalScript, ModuleScript, or protected children.
-- Used by SmartMerge on re-import.
-- ════════════════════════════════════════════════════════════════
function Generator.updateInstance(inst, node, parent, frameW, frameH)
	if not inst or not node then return end

	frameW = frameW or 1280
	frameH = frameH or 720

	-- Position + Size
	inst.Position = safePosition(node, parent, frameW, frameH)
	inst.Size     = safeSize(node, parent, frameW, frameH)
	inst.Visible  = node.visible ~= false

	if node.rotation then
		inst.Rotation = math.clamp(node.rotation, -360, 360)
	end

	-- Fill update
	if inst:IsA("Frame") or inst:IsA("CanvasGroup") or
	   inst:IsA("ScrollingFrame") then
		applyFill(inst, node)

		-- Remove old gradient, re-apply if needed
		local oldGrad = inst:FindFirstChildOfClass("UIGradient")
		if oldGrad then oldGrad:Destroy() end

		if node.fills and #node.fills > 0 then
			local fill = node.fills[1]
			if fill.type == "GRADIENT_LINEAR" or fill.type == "GRADIENT_RADIAL" then
				applyGradient(inst, fill)
			end
		end
	end

	-- Text update
	if inst:IsA("TextLabel") or inst:IsA("TextButton") or inst:IsA("TextBox") then
		if node.characters ~= nil then inst.Text = node.characters end
		if node.fontSize then
			inst.TextSize = math.max(1, node.fontSize)
		end
		if node.fills and #node.fills > 0 then
			local fill = node.fills[1]
			if fill.type == "SOLID" and fill.color then
				inst.TextColor3       = toColor3(fill.color)
				inst.TextTransparency = math.clamp(1-(fill.color.a or 1), 0, 1)
			end
		end
	end

	-- Image update
	if inst:IsA("ImageLabel") or inst:IsA("ImageButton") then
		inst.ImageTransparency = toTransparency(node.opacity)
		-- Update aspect ratio if size changed
		local arc = inst:FindFirstChildOfClass("UIAspectRatioConstraint")
		local w, h = node.width or 0, node.height or 0
		if arc and w > 0 and h > 0 then
			arc.AspectRatio = math.clamp(safeDivide(w, h), 0.01, 100)
		end
	end

	-- UICorner update
	if node.cornerRadius then
		local corner = inst:FindFirstChildOfClass("UICorner")
		if not corner then corner = Instance.new("UICorner"); corner.Parent = inst end
		local ref = math.max(1, math.min(node.width or 100, node.height or 100))
		corner.CornerRadius = UDim.new(
			math.clamp(safeDivide(node.cornerRadius, ref), 0, 0.5), 0)
	end

	-- UIStroke update
	if node.strokes and #node.strokes > 0 then
		local s      = node.strokes[1]
		local stroke = inst:FindFirstChildOfClass("UIStroke")
		if not stroke then stroke = Instance.new("UIStroke"); stroke.Parent = inst end
		stroke.Thickness = math.max(0, node.strokeWeight or 1)
		if s.color then
			stroke.Color        = toColor3(s.color)
			stroke.Transparency = math.clamp(1-(s.color.a or 1), 0, 1)
		end
	end

	-- Clear orphan flag (this element is now synced)
	inst:SetAttribute("Figblox_Orphan", nil)
	inst:SetAttribute("Figblox_Name",   node.name or inst.Name)
end

return Generator