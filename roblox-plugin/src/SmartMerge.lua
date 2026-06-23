-- ============================================================
-- SmartMerge.lua — Bloxig v2.2 (Step 2: nesting + uniform scale)
--
-- STEP 2 CHANGES vs v2.1:
--   * Children now scale against their IMMEDIATE PARENT's Figma
--     pixel size (parentW/parentH), not the root frame size.
--     This fixes nested elements collapsing toward the top-left.
--   * Root frame is now a centered, aspect-ratio-locked container
--     (UIAspectRatioConstraint) that scales the whole design
--     uniformly to fit any screen WITHOUT stretching.
--   * Frame size is read automatically from payload.frame.
--   * lockText / lockStroke still use ROOT dims (kept consistent).
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

-- ── Configure root frame for responsive uniform scaling ──────
-- Centered + aspect-ratio locked to the Figma frame, so the whole
-- design scales to fit the screen with NO distortion (letterboxes).
local function configureRoot(rootFrame, frameW, frameH)
	rootFrame.AnchorPoint            = Vector2.new(0.5, 0.5)
	rootFrame.Position               = UDim2.fromScale(0.5, 0.5)
	rootFrame.Size                   = UDim2.fromScale(1, 1)
	rootFrame.BackgroundTransparency = 1
	rootFrame:SetAttribute("Figblox_W", frameW)
	rootFrame:SetAttribute("Figblox_H", frameH)

	local arc = rootFrame:FindFirstChildOfClass("UIAspectRatioConstraint")
		or Instance.new("UIAspectRatioConstraint")
	arc.AspectRatio  = math.max(0.01, frameW / frameH)
	arc.AspectType   = Enum.AspectType.FitWithinMaxSize
	arc.DominantAxis = Enum.DominantAxis.Width
	arc.Parent       = rootFrame
end

-- ── Update visual properties on existing instance ────────────
-- parentW/parentH = the immediate parent's Figma pixel size (pos/size)
-- rootW/rootH     = the whole frame size (text/stroke locking)
local function updateVisualProperties(inst, node, parent, parentW, parentH, rootW, rootH)
	parentW = math.max(1, parentW or 1280)
	parentH = math.max(1, parentH or 720)
	rootW   = math.max(1, rootW or parentW)
	rootH   = math.max(1, rootH or parentH)

	-- Position + Size — scaled against the PARENT (fixes nesting)
	inst.Position = ScaleConverter.toPosition(node.x or 0, node.y or 0, parent, parentW, parentH)
	inst.Size     = ScaleConverter.toSize(node.width or 0, node.height or 0, parent, parentW, parentH)
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
		-- Lock text — scales with UI, capped at Figma px (Option 3)
		ScaleConverter.lockText(inst, node, rootH)
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
		-- Lock stroke — scaled relative to ROOT frame width (consistent)
		ScaleConverter.lockStroke(inst, node, rootW)
	end

	-- Clear orphan flag
	inst:SetAttribute("Figblox_Orphan", nil)
	inst:SetAttribute("Figblox_Name",   node.name or inst.Name)
end

-- ── Preview: diff without applying ───────────────────────────
function SmartMerge.preview(payload, container)
	local idMap  = buildIDMap(container)
	local result = { new = {}, changed = {}, synced = {} }

	local frameW = math.max(1, payload.frame and payload.frame.width  or 1280)
	local frameH = math.max(1, payload.frame and payload.frame.height or 720)

	-- refW/refH = immediate parent dims (top-level uses frame dims)
	local function scan(nodes, refW, refH)
		if not nodes then return end
		refW = math.max(1, refW or frameW)
		refH = math.max(1, refH or frameH)
		for _, node in ipairs(nodes) do
			if idMap[node.id] then
				local inst         = idMap[node.id]
				local expectedPos  = ScaleConverter.toPosition(
					node.x or 0, node.y or 0, inst.Parent, refW, refH)
				local expectedSize = ScaleConverter.toSize(
					node.width or 0, node.height or 0, inst.Parent, refW, refH)

				if inst.Position == expectedPos and inst.Size == expectedSize then
					table.insert(result.synced,  { id = node.id, name = node.name })
				else
					table.insert(result.changed, { id = node.id, name = node.name })
				end
			else
				table.insert(result.new, { id = node.id, name = node.name })
			end

			if node.children then
				scan(node.children,
					math.max(1, node.width  or refW),
					math.max(1, node.height or refH))
			end
		end
	end

	scan(payload.nodes, frameW, frameH)
	return result
end

-- ── Apply Smart Merge ─────────────────────────────────────────
function SmartMerge.apply(payload, container)
	local idMap   = buildIDMap(container)
	local jsonIds = collectJSONIds(payload.nodes)
	local stats   = { merged = 0, created = 0, orphaned = 0 }

	-- Auto-read frame dims ONCE (root reference)
	local frameW = math.max(1, payload.frame and payload.frame.width  or 1280)
	local frameH = math.max(1, payload.frame and payload.frame.height or 720)

	-- refW/refH = immediate parent's Figma pixel size at this depth.
	local function processNodes(nodes, parent, refW, refH)
		if not nodes then return end
		refW = math.max(1, refW or frameW)
		refH = math.max(1, refH or frameH)

		for _, node in ipairs(nodes) do
			local existing = idMap[node.id]

			if existing then
				-- MATCH: update visual props, scaled vs PARENT dims
				updateVisualProperties(existing, node, existing.Parent,
					refW, refH, frameW, frameH)
				stats.merged = stats.merged + 1

				if node.children then
					processNodes(node.children, existing,
						math.max(1, node.width  or refW),
						math.max(1, node.height or refH))
				end
			else
				-- NO MATCH: create via Generator, scaled vs PARENT dims.
				-- Generator recurses into this node's children itself,
				-- using node.width/height as the child reference.
				Generator.createInstance(node, parent, refW, refH)
				stats.created = stats.created + 1
			end
		end
	end

	-- Find or create root frame
	local rootName = payload.frame and payload.frame.name or "BloxigRoot"
	local rootFrame = container:FindFirstChild(rootName)

	if not rootFrame then
		rootFrame = Instance.new("Frame")
		rootFrame.Name = rootName
		rootFrame:SetAttribute("Figblox_ID",   payload.frame and payload.frame.id or "root")
		rootFrame:SetAttribute("Figblox_Root", true)
		rootFrame.Parent = container
	end

	-- Apply responsive uniform-scale setup every time (handles re-import
	-- and frame-size changes between exports).
	configureRoot(rootFrame, frameW, frameH)

	processNodes(payload.nodes, rootFrame, frameW, frameH)

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
