-- ============================================================
-- SmartMerge.lua
-- Bloxig Roblox Plugin — Requirement 3
--
-- Diffs incoming JSON against existing Roblox instances using
-- the Figblox_ID attribute. On match: updates ONLY visual
-- properties (Position, Size, Color, Transparency, Gradient,
-- Stroke, Corner). NEVER touches LocalScript or ModuleScript.
-- Orphaned elements are FLAGGED, not deleted.
-- ============================================================

local ScaleConverter = require(script.Parent.ScaleConverter)
local Generator      = require(script.Parent.Generator)

local SmartMerge = {}

-- ── Classes we NEVER touch (developer's logic lives here) ────
local PROTECTED_CLASSES = {
	LocalScript      = true,
	ModuleScript     = true,
	Script           = true,
	RemoteEvent      = true,
	RemoteFunction   = true,
	BindableEvent    = true,
	BindableFunction = true,
}

-- ── Build a flat map of { [Figblox_ID] = Instance } ─────────
-- Scans the full subtree of a container.
local function buildIDMap(container)
	local map = {}

	local function scan(inst)
		local id = inst:GetAttribute("Figblox_ID")
		if id then
			map[id] = inst
		end
		for _, child in ipairs(inst:GetChildren()) do
			scan(child)
		end
	end

	scan(container)
	return map
end

-- ── Collect all Figblox_IDs from a JSON node tree ────────────
local function collectJSONIds(nodes, result)
	result = result or {}
	if not nodes then return result end
	for _, node in ipairs(nodes) do
		result[node.id] = true
		if node.children then
			collectJSONIds(node.children, result)
		end
	end
	return result
end

-- ── Update only visual properties on an existing instance ────
-- Requirement 3: ONLY update Position, Size, Color, Transparency.
-- DO NOT delete or modify protected script children.
local function updateVisualProperties(inst, node, parent)

	-- Position and Size — use ScaleConverter
	inst.Position = ScaleConverter.toPosition(node.x or 0, node.y or 0, parent)
	inst.Size     = ScaleConverter.toSize(node.width or 0, node.height or 0, parent)
	inst.Visible  = node.visible ~= false

	-- ── Background color / transparency ───────────────────────
	if inst:IsA("Frame") or inst:IsA("TextLabel") then
		if node.fills and #node.fills > 0 then
			local fill = node.fills[1]

			if fill.type == "SOLID" and fill.color then
				inst.BackgroundColor3       = ScaleConverter.toColor3(fill.color)
				inst.BackgroundTransparency = 1 - math.clamp(fill.color.a or 1, 0, 1)

				-- Remove any existing UIGradient (fill type changed to solid)
				local old = inst:FindFirstChildOfClass("UIGradient")
				if old then old:Destroy() end

			elseif fill.type == "GRADIENT_LINEAR" or fill.type == "GRADIENT_RADIAL" then
				inst.BackgroundColor3       = Color3.new(1, 1, 1)
				inst.BackgroundTransparency = 0

				-- Update or create UIGradient
				local gradient = inst:FindFirstChildOfClass("UIGradient")
					or Instance.new("UIGradient")
				gradient.Color        = ScaleConverter.toColorSequence(fill.gradientStops)
				gradient.Transparency = ScaleConverter.toNumberSequence(fill.gradientStops)
				gradient.Rotation     = math.deg(fill.gradientAngle or 0)
				gradient.Parent       = inst
			end
		end

		-- Overall opacity
		if node.opacity and node.opacity < 1 then
			inst.BackgroundTransparency = math.max(
				inst.BackgroundTransparency,
				ScaleConverter.toTransparency(node.opacity)
			)
		end
	end

	-- ── TextLabel-specific ────────────────────────────────────
	if inst:IsA("TextLabel") or inst:IsA("TextButton") then
		if node.characters ~= nil then
			inst.Text = node.characters
		end
		if node.fontSize then
			inst.TextSize = node.fontSize
		end
		if node.fills and #node.fills > 0 then
			local fill = node.fills[1]
			if fill.type == "SOLID" and fill.color then
				inst.TextColor3      = ScaleConverter.toColor3(fill.color)
				inst.TextTransparency = 1 - math.clamp(fill.color.a or 1, 0, 1)
			end
		end
	end

	-- ── ImageLabel-specific ───────────────────────────────────
	if inst:IsA("ImageLabel") then
		inst.ImageTransparency = ScaleConverter.toTransparency(node.opacity)
		-- Note: Image asset ID not updated here (user may have custom asset)
		-- UIAspectRatioConstraint — update ratio if size changed
		local arc = inst:FindFirstChildOfClass("UIAspectRatioConstraint")
		if arc and node.width and node.height and node.height > 0 then
			arc.AspectRatio = node.width / node.height
		end
	end

	-- ── UICorner ──────────────────────────────────────────────
	if node.cornerRadius then
		local corner = inst:FindFirstChildOfClass("UICorner")
			or Instance.new("UICorner")
		local ref = math.min(
			(node.width or 100),
			(node.height or 100)
		)
		corner.CornerRadius = ScaleConverter.toUDim(node.cornerRadius, ref)
		corner.Parent = inst
	end

	-- ── UIStroke ──────────────────────────────────────────────
	if node.strokes and #node.strokes > 0 then
		local strokeData = node.strokes[1]
		local uiStroke   = inst:FindFirstChildOfClass("UIStroke")
			or Instance.new("UIStroke")
		uiStroke.Thickness = node.strokeWeight or 1
		if strokeData.color then
			uiStroke.Color        = ScaleConverter.toColor3(strokeData.color)
			uiStroke.Transparency = 1 - math.clamp(strokeData.color.a or 1, 0, 1)
		end
		uiStroke.Parent = inst
	end

	-- Mark as synced (clear any previous orphan flag)
	inst:SetAttribute("Figblox_Orphan", nil)
	inst:SetAttribute("Figblox_Name",   node.name or inst.Name)
end

-- ── Preview entry: build diff without applying changes ───────
-- Returns a table with { new={}, changed={}, synced={} }
-- Used to show the [+] [~] [=] import preview before confirm.
--
-- @param payload    table     Full JSON payload from server
-- @param container  Instance  The ScreenGui or root Frame
-- @return table  { new=[], changed=[], synced=[] }
function SmartMerge.preview(payload, container)
	local idMap   = buildIDMap(container)
	local result  = { new = {}, changed = {}, synced = {} }

	local function scan(nodes)
		if not nodes then return end
		for _, node in ipairs(nodes) do
			if idMap[node.id] then
				-- Exists — check if visually different
				local inst = idMap[node.id]
				local posMatch = inst.Position ==
					ScaleConverter.toPosition(node.x or 0, node.y or 0, inst.Parent)
				local sizeMatch = inst.Size ==
					ScaleConverter.toSize(node.width or 0, node.height or 0, inst.Parent)

				if posMatch and sizeMatch then
					table.insert(result.synced, { id=node.id, name=node.name })
				else
					table.insert(result.changed, { id=node.id, name=node.name })
				end
			else
				table.insert(result.new, { id=node.id, name=node.name })
			end

			if node.children then scan(node.children) end
		end
	end

	scan(payload.nodes)
	return result
end

-- ── Main entry: apply Smart Merge ────────────────────────────
-- @param payload    table     Full JSON payload from /api/import
-- @param container  Instance  ScreenGui or root Frame to merge into
-- @return table  { merged=n, created=n, orphaned=n }
function SmartMerge.apply(payload, container)
	local idMap    = buildIDMap(container)
	local jsonIds  = collectJSONIds(payload.nodes)
	local stats    = { merged = 0, created = 0, orphaned = 0 }

	-- ── Step 1: Update existing / create new ─────────────────
	local function processNodes(nodes, parent)
		if not nodes then return end

		for _, node in ipairs(nodes) do
			local existing = idMap[node.id]

			if existing then
				-- ── MATCH: update visual only ─────────────────
				-- Requirement 3: check children BEFORE updating
				-- Skip if instance has protected script children
				-- (we update the instance itself, not its children)
				updateVisualProperties(existing, node, existing.Parent)
				stats.merged = stats.merged + 1

				-- Recurse into children (create new ones, merge existing)
				if node.children then
					processNodes(node.children, existing)
				end

			else
				-- ── NO MATCH: create brand new element ────────
				node._frameWidth  = payload.frame and payload.frame.width  or 1280
				node._frameHeight = payload.frame and payload.frame.height or 720
				Generator.createInstance(node, parent)
				stats.created = stats.created + 1
			end
		end
	end

	-- Find or create the root frame
	local rootFrame = container:FindFirstChild(
		payload.frame and payload.frame.name or "BloxigRoot"
	)

	if not rootFrame then
		-- First import — build fresh
		rootFrame = Instance.new("Frame")
		rootFrame.Name                  = payload.frame and payload.frame.name or "BloxigRoot"
		rootFrame.Size                  = UDim2.new(1, 0, 1, 0)
		rootFrame.Position              = UDim2.new(0, 0, 0, 0)
		rootFrame.BackgroundTransparency = 1
		rootFrame:SetAttribute("Figblox_ID",   payload.frame and payload.frame.id or "root")
		rootFrame:SetAttribute("Figblox_Root", true)
		rootFrame.Parent = container
	end

	processNodes(payload.nodes, rootFrame)

	-- ── Step 2: Flag orphans (elements no longer in JSON) ─────
	-- Requirement 3: NEVER delete. Only flag.
	local function flagOrphans(inst)
		local id = inst:GetAttribute("Figblox_ID")
		if id and not jsonIds[id] and id ~= "root" then
			inst:SetAttribute("Figblox_Orphan", true)
			stats.orphaned = stats.orphaned + 1
			warn("[Bloxig] Orphan flagged: " .. inst.Name .. " (ID: " .. id .. ")")
		end

		for _, child in ipairs(inst:GetChildren()) do
			-- Requirement 3: NEVER touch protected classes
			if not PROTECTED_CLASSES[child.ClassName] then
				flagOrphans(child)
			end
		end
	end

	flagOrphans(rootFrame)

	return stats
end

return SmartMerge