-- ============================================================
-- SmartMerge.lua — Bloxig v2.1 (FIXED)
--
-- FIX 1: frameW/frameH passed to ALL ScaleConverter calls
--         so edit-mode positions/sizes are correct.
-- FIX 2: lockText() called on every text element after update.
-- FIX 3: lockStroke() called on every stroked element after update.
-- FIX 4: apply() double-call bug fixed — stats captured in pcall.
-- ============================================================

local ScaleConverter = require(script.Parent.ScaleConverter)
local Generator      = require(script.Parent.Generator)

local SmartMerge = {}

local PROTECTED_CLASSES = {
	LocalScript      = true, ModuleScript     = true,
	Script           = true, RemoteEvent      = true,
	RemoteFunction   = true, BindableEvent    = true,
	BindableFunction = true,
}

-- ── Build flat { [Figblox_ID] = Instance } map ───────────────
local function buildIDMap(container)
	local map = {}
	local function scan(inst)
		local id = inst:GetAttribute("Figblox_ID")
		if id then map[id] = inst end
		for _, child in ipairs(inst:GetChildren()) do scan(child) end
	end
	scan(container)
	return map
end

-- ── Collect all IDs from JSON tree ───────────────────────────
local function collectJSONIds(nodes, result)
	result = result or {}
	if not nodes then return result end
	for _, node in ipairs(nodes) do
		result[node.id] = true
		if node.children then collectJSONIds(node.children, result) end
	end
	return result
end

-- ── Update visual properties on existing instance ────────────
-- ✅ FIX 1: All ScaleConverter calls now pass frameW, frameH
-- ✅ FIX 2: lockText() called after text properties set
-- ✅ FIX 3: lockStroke() called after stroke applied
local function updateVisualProperties(inst, node, parent, frameW, frameH)
	frameW = frameW or 1280
	frameH = frameH or 720

	-- Position + Size — now uses explicit frame dims (edit mode safe)
	inst.Position = ScaleConverter.toPosition(node.x or 0, node.y or 0, parent, frameW, frameH)
	inst.Size     = ScaleConverter.toSize(node.width or 0, node.height or 0, parent, frameW, frameH)
	inst.Visible  = node.visible ~= false

	-- ── Background fill ───────────────────────────────────────
	if inst:IsA("Frame") or inst:IsA("TextLabel") or
	   inst:IsA("CanvasGroup") or inst:IsA("ScrollingFrame") then
		if node.fills and #node.fills > 0 then
			local fill = node.fills[1]

			if fill.type == "SOLID" and fill.color then
				inst.BackgroundColor3       = ScaleConverter.toColor3(fill.color)
				inst.BackgroundTransparency = 1 - math.clamp(fill.color.a or 1, 0, 1)
				local old = inst:FindFirstChildOfClass("UIGradient")
				if old then old:Destroy() end

			elseif fill.type == "GRADIENT_LINEAR" or fill.type == "GRADIENT_RADIAL" then
				inst.BackgroundColor3       = Color3.new(1, 1, 1)
				inst.BackgroundTransparency = 0
				local gradient = inst:FindFirstChildOfClass("UIGradient")
					or Instance.new("UIGradient")
				gradient.Color        = ScaleConverter.toColorSequence(fill.gradientStops)
				gradient.Transparency = ScaleConverter.toNumberSequence(fill.gradientStops)
				gradient.Rotation     = math.deg(fill.gradientAngle or 0)
				gradient.Parent       = inst
			end
		end

		if node.opacity and node.opacity < 1 then
			inst.BackgroundTransparency = math.max(
				inst.BackgroundTransparency,
				ScaleConverter.toTransparency(node.opacity)
			)
		end
	end

	-- ── Text properties ───────────────────────────────────────
	if inst:IsA("TextLabel") or inst:IsA("TextButton") or inst:IsA("TextBox") then
		if node.characters ~= nil then inst.Text = node.characters end
		if node.fills and #node.fills > 0 then
			local fill = node.fills[1]
			if fill.type == "SOLID" and fill.color then
				inst.TextColor3       = ScaleConverter.toColor3(fill.color)
				inst.TextTransparency = 1 - math.clamp(fill.color.a or 1, 0, 1)
			end
		end

		-- ✅ FIX 2: Lock text — TextScaled=false, exact px size
		ScaleConverter.lockText(inst, node, frameH)
	end

	-- ── Image ─────────────────────────────────────────────────
	if inst:IsA("ImageLabel") then
		inst.ImageTransparency = ScaleConverter.toTransparency(node.opacity)
		local arc = inst:FindFirstChildOfClass("UIAspectRatioConstraint")
		if arc and node.width and node.height and node.height > 0 then
			arc.AspectRatio = node.width / node.height
		end
	end

	-- ── UICorner ──────────────────────────────────────────────
	if node.cornerRadius then
		local corner = inst:FindFirstChildOfClass("UICorner")
			or Instance.new("UICorner")
		local ref = math.min(node.width or 100, node.height or 100)
		corner.CornerRadius = ScaleConverter.toUDim(node.cornerRadius, math.max(1, ref))
		corner.Parent = inst
	end

	-- ── UIStroke ──────────────────────────────────────────────
	if node.strokes and #node.strokes > 0 then
		local strokeData = node.strokes[1]
		local uiStroke   = inst:FindFirstChildOfClass("UIStroke")
			or Instance.new("UIStroke")
		uiStroke.Thickness = math.max(0, node.strokeWeight or 1)
		if strokeData.color then
			uiStroke.Color        = ScaleConverter.toColor3(strokeData.color)
			uiStroke.Transparency = 1 - math.clamp(strokeData.color.a or 1, 0, 1)
		end
		uiStroke.Parent = inst

		-- ✅ FIX 3: Lock stroke — scale relative to frame width
		ScaleConverter.lockStroke(inst, node, frameW)
	end

	-- Clear orphan flag
	inst:SetAttribute("Figblox_Orphan", nil)
	inst:SetAttribute("Figblox_Name",   node.name or inst.Name)
end

-- ── Preview: diff without applying ───────────────────────────
function SmartMerge.preview(payload, container)
	local idMap  = buildIDMap(container)
	local result = { new = {}, changed = {}, synced = {} }

	-- ✅ FIX 1: Get frame dims for accurate position comparison
	local frameW = payload.frame and payload.frame.width  or 1280
	local frameH = payload.frame and payload.frame.height or 720

	local function scan(nodes)
		if not nodes then return end
		for _, node in ipairs(nodes) do
			if idMap[node.id] then
				local inst      = idMap[node.id]
				local expectedPos  = ScaleConverter.toPosition(
					node.x or 0, node.y or 0, inst.Parent, frameW, frameH)
				local expectedSize = ScaleConverter.toSize(
					node.width or 0, node.height or 0, inst.Parent, frameW, frameH)

				if inst.Position == expectedPos and inst.Size == expectedSize then
					table.insert(result.synced,  { id = node.id, name = node.name })
				else
					table.insert(result.changed, { id = node.id, name = node.name })
				end
			else
				table.insert(result.new, { id = node.id, name = node.name })
			end
			if node.children then scan(node.children) end
		end
	end

	scan(payload.nodes)
	return result
end

-- ── Apply Smart Merge ─────────────────────────────────────────
-- ✅ FIX 4: apply() no longer called twice — stats returned once
function SmartMerge.apply(payload, container)
	local idMap   = buildIDMap(container)
	local jsonIds = collectJSONIds(payload.nodes)
	local stats   = { merged = 0, created = 0, orphaned = 0 }

	-- ✅ FIX 1: Extract frame dims ONCE, pass everywhere
	local frameW = math.max(1, payload.frame and payload.frame.width  or 1280)
	local frameH = math.max(1, payload.frame and payload.frame.height or 720)

	local function processNodes(nodes, parent)
		if not nodes then return end

		for _, node in ipairs(nodes) do
			local existing = idMap[node.id]

			if existing then
				-- MATCH: update visual properties only
				updateVisualProperties(existing, node, existing.Parent, frameW, frameH)
				stats.merged = stats.merged + 1

				if node.children then
					processNodes(node.children, existing)
				end
			else
				-- NO MATCH: create new element via Generator
				node._frameWidth  = frameW
				node._frameHeight = frameH
				Generator.createInstance(node, parent, frameW, frameH)
				stats.created = stats.created + 1
			end
		end
	end

	-- Find or create root frame
	local rootFrame = container:FindFirstChild(
		payload.frame and payload.frame.name or "BloxigRoot"
	)

	if not rootFrame then
		rootFrame = Instance.new("Frame")
		rootFrame.Name                   = payload.frame and payload.frame.name or "BloxigRoot"
		rootFrame.Size                   = UDim2.new(1, 0, 1, 0)
		rootFrame.Position               = UDim2.new(0, 0, 0, 0)
		rootFrame.BackgroundTransparency = 1
		rootFrame:SetAttribute("Figblox_ID",   payload.frame and payload.frame.id or "root")
		rootFrame:SetAttribute("Figblox_Root", true)
		rootFrame:SetAttribute("Figblox_W",    frameW)
		rootFrame:SetAttribute("Figblox_H",    frameH)
		rootFrame.Parent = container
	end

	processNodes(payload.nodes, rootFrame)

	-- Flag orphans — NEVER delete, only mark
	local function flagOrphans(inst)
		local id = inst:GetAttribute("Figblox_ID")
		if id and not jsonIds[id] and id ~= "root" then
			inst:SetAttribute("Figblox_Orphan", true)
			stats.orphaned = stats.orphaned + 1
			warn("[Bloxig] Orphan: " .. inst.Name .. " (ID: " .. id .. ")")
		end
		for _, child in ipairs(inst:GetChildren()) do
			if not PROTECTED_CLASSES[child.ClassName] then
				flagOrphans(child)
			end
		end
	end

	flagOrphans(rootFrame)

	print(string.format("[Bloxig] Merge — Created:%d Merged:%d Orphans:%d",
		stats.created, stats.merged, stats.orphaned))

	return stats
end

return SmartMerge