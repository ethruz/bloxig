-- ============================================================
-- Main.lua — Bloxig v2.1 (FIXED)
--
-- FIX 1: confirmBtn double apply() bug fixed.
-- FIX 2: Tool chain runs after confirm:
--         SmartMerge.apply → lockText all → lockStroke all → log
-- FIX 3: ChangeHistoryService wrappers added for undo support.
-- ============================================================

local HttpService   = game:GetService("HttpService")
local StarterGui    = game:GetService("StarterGui")
local Selection     = game:GetService("Selection")
local ChangeHistory = game:GetService("ChangeHistoryService")

local SmartMerge    = require(script.Parent.SmartMerge)
local Generator     = require(script.Parent.Generator)
local ScaleConverter = require(script.Parent.ScaleConverter)

local PLUGIN_NAME    = "Bloxig"
local PLUGIN_VERSION = "2.1.0"
local SERVER_URL     = "http://localhost:3000" -- → https://bloxig.onrender.com in prod

-- ── Toolbar ───────────────────────────────────────────────────
local toolbar = plugin:CreateToolbar(PLUGIN_NAME)
local button  = toolbar:CreateButton(
	"Bloxig Import",
	"Import Figma layout into Studio",
	"rbxassetid://0"
)

-- ── Widget ────────────────────────────────────────────────────
local widgetInfo = DockWidgetPluginGuiInfo.new(
	Enum.InitialDockState.Right,
	false, false, 300, 520, 280, 400
)
local widget = plugin:CreateDockWidgetPluginGui("BloxigWidget", widgetInfo)
widget.Title   = "Bloxig"
widget.Enabled = false

button.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

-- ── Persistent storage ────────────────────────────────────────
local function saveToken(t)     plugin:SetSetting("BloxigToken",     t) end
local function loadToken()      return plugin:GetSetting("BloxigToken")     or "" end
local function saveProjectId(i) plugin:SetSetting("BloxigProjectId", i) end
local function loadProjectId()  return plugin:GetSetting("BloxigProjectId") or "" end

-- ── HTTP fetch ────────────────────────────────────────────────
local function fetchLayout(projectId, token)
	local url = SERVER_URL .. "/api/import/" .. projectId
	local ok, response = pcall(function()
		return HttpService:RequestAsync({
			Url     = url,
			Method  = "GET",
			Headers = {
				["Authorization"] = "Bearer " .. token,
				["Content-Type"]  = "application/json"
			}
		})
	end)

	if not ok then
		return nil, "Network error: " .. tostring(response) .. "\nIs the server running?"
	end
	if response.StatusCode == 401 then return nil, "Invalid token." end
	if response.StatusCode == 404 then return nil, "Project not found." end
	if response.StatusCode ~= 200 then
		return nil, "Server error " .. response.StatusCode
	end

	local data = HttpService:JSONDecode(response.Body)
	if not data.success or not data.json_layout_data then
		return nil, "Server returned empty layout."
	end
	return data.json_layout_data, nil
end

-- ── Target container ─────────────────────────────────────────
local function getTargetContainer()
	local selected = Selection:Get()
	for _, inst in ipairs(selected) do
		if inst:IsA("ScreenGui") then return inst end
	end
	local existing = StarterGui:FindFirstChild("BloxigGui")
	if existing then return existing end

	local gui = Instance.new("ScreenGui")
	gui.Name           = "BloxigGui"
	gui.ResetOnSpawn   = false
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.Parent         = StarterGui
	return gui
end

-- ── Preview formatter ─────────────────────────────────────────
local function formatPreview(diff)
	local lines = {
		"━━ Import Preview ━━",
		"[+] New:     " .. #diff.new,
		"[~] Changed: " .. #diff.changed,
		"[=] Synced:  " .. #diff.synced,
		""
	}
	if #diff.new > 0 then
		table.insert(lines, "NEW:")
		for i, item in ipairs(diff.new) do
			if i > 5 then table.insert(lines, "  ...+" .. (#diff.new-5) .. " more"); break end
			table.insert(lines, "  + " .. (item.name or item.id))
		end
	end
	if #diff.changed > 0 then
		table.insert(lines, "CHANGED:")
		for i, item in ipairs(diff.changed) do
			if i > 5 then table.insert(lines, "  ...+" .. (#diff.changed-5) .. " more"); break end
			table.insert(lines, "  ~ " .. (item.name or item.id))
		end
	end
	return table.concat(lines, "\n")
end

-- ════════════════════════════════════════════════════════════════
-- ✅ FIX 2: Tool chain — runs after every successful import
-- Matches Figblox: apply → Lock Text → Lock Stroke (auto)
-- ════════════════════════════════════════════════════════════════
local function runToolChain(container, payload, stats)
	local frameW = payload.frame and payload.frame.width  or 1280
	local frameH = payload.frame and payload.frame.height or 720
	local locked = { text = 0, stroke = 0 }

	-- Walk the full tree under the container
	local function walk(inst)
		-- Lock Text on all text instances
		if inst:IsA("TextLabel") or inst:IsA("TextButton") or inst:IsA("TextBox") then
			local id   = inst:GetAttribute("Figblox_ID")
			-- Get stored font size from attribute or TextSize
			local node = { fontSize = inst.TextSize }
			ScaleConverter.lockText(inst, node, frameH)
			locked.text = locked.text + 1
		end

		-- Lock Stroke on any instance with UIStroke
		local stroke = inst:FindFirstChildOfClass("UIStroke")
		if stroke then
			local rawStroke = inst:GetAttribute("Figblox_LockedStroke") or stroke.Thickness
			local node      = {
				strokes      = {{ color = nil }},
				strokeWeight = rawStroke
			}
			ScaleConverter.lockStroke(inst, node, frameW)
			locked.stroke = locked.stroke + 1
		end

		for _, child in ipairs(inst:GetChildren()) do
			walk(child)
		end
	end

	walk(container)

	print(string.format(
		"[Bloxig] Tool chain complete — Locked text:%d  Locked strokes:%d",
		locked.text, locked.stroke
	))

	return locked
end

-- ── Build plugin widget UI ────────────────────────────────────
local function buildUI()
	for _, c in ipairs(widget:GetChildren()) do c:Destroy() end

	local bg = Instance.new("Frame")
	bg.Size             = UDim2.new(1,0,1,0)
	bg.BackgroundColor3 = Color3.fromRGB(18,18,18)
	bg.BorderSizePixel  = 0
	bg.Parent           = widget

	local header = Instance.new("Frame")
	header.Size             = UDim2.new(1,0,0,48)
	header.BackgroundColor3 = Color3.fromRGB(12,12,12)
	header.BorderSizePixel  = 0
	header.Parent           = bg

	local title = Instance.new("TextLabel")
	title.Text               = "Bloxig  v" .. PLUGIN_VERSION
	title.Size               = UDim2.new(1,-16,1,0)
	title.Position           = UDim2.new(0,16,0,0)
	title.BackgroundTransparency = 1
	title.TextColor3         = Color3.fromRGB(239,239,239)
	title.TextSize           = 14
	title.Font               = Enum.Font.GothamBold
	title.TextXAlignment     = Enum.TextXAlignment.Left
	title.Parent             = header

	local scroll = Instance.new("ScrollingFrame")
	scroll.Size              = UDim2.new(1,0,1,-48)
	scroll.Position          = UDim2.new(0,0,0,48)
	scroll.BackgroundTransparency = 1
	scroll.ScrollBarThickness = 4
	scroll.ScrollBarImageColor3 = Color3.fromRGB(80,80,80)
	scroll.CanvasSize        = UDim2.new(0,0,0,640)
	scroll.Parent            = bg

	local layout = Instance.new("UIListLayout")
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding   = UDim.new(0, 8)
	layout.Parent    = scroll

	local padding = Instance.new("UIPadding")
	padding.PaddingLeft  = UDim.new(0,12)
	padding.PaddingRight = UDim.new(0,12)
	padding.PaddingTop   = UDim.new(0,12)
	padding.Parent       = scroll

	local function makeLabel(text, size, color, order)
		local lbl = Instance.new("TextLabel")
		lbl.Text             = text
		lbl.Size             = UDim2.new(1,-24,0,size)
		lbl.BackgroundTransparency = 1
		lbl.TextColor3       = color or Color3.fromRGB(153,153,153)
		lbl.TextSize         = 11
		lbl.Font             = Enum.Font.Gotham
		lbl.TextXAlignment   = Enum.TextXAlignment.Left
		lbl.TextWrapped      = true
		lbl.LayoutOrder      = order or 0
		lbl.Parent           = scroll
		return lbl
	end

	local function makeInput(placeholder, defaultVal, order)
		local box = Instance.new("TextBox")
		box.PlaceholderText   = placeholder
		box.Text              = defaultVal or ""
		box.Size              = UDim2.new(1,-24,0,34)
		box.BackgroundColor3  = Color3.fromRGB(28,28,28)
		box.BorderSizePixel   = 0
		box.TextColor3        = Color3.fromRGB(239,239,239)
		box.PlaceholderColor3 = Color3.fromRGB(85,85,85)
		box.TextSize          = 12
		box.Font              = Enum.Font.Code
		box.ClearTextOnFocus  = false
		box.LayoutOrder       = order or 0
		box.Parent            = scroll
		local c = Instance.new("UICorner"); c.CornerRadius = UDim.new(0,6); c.Parent = box
		local p = Instance.new("UIPadding"); p.PaddingLeft = UDim.new(0,8); p.Parent = box
		return box
	end

	local function makeButton(text, color, textColor, order)
		local btn = Instance.new("TextButton")
		btn.Text             = text
		btn.Size             = UDim2.new(1,-24,0,36)
		btn.BackgroundColor3 = color or Color3.fromRGB(79,123,247)
		btn.BorderSizePixel  = 0
		btn.TextColor3       = textColor or Color3.fromRGB(255,255,255)
		btn.TextSize         = 13
		btn.Font             = Enum.Font.GothamBold
		btn.LayoutOrder      = order or 0
		btn.Parent           = scroll
		local c = Instance.new("UICorner"); c.CornerRadius = UDim.new(0,6); c.Parent = btn
		return btn
	end

	-- ── UI Fields ─────────────────────────────────────────────
	makeLabel("API TOKEN", 16, Color3.fromRGB(85,85,85), 1)
	local tokenBox = makeInput("Paste token from bloxig.com/dashboard", loadToken(), 2)

	makeLabel("PROJECT ID", 16, Color3.fromRGB(85,85,85), 3)
	local projectBox = makeInput("e.g. 6650f3a2c1234abcd", loadProjectId(), 4)

	local statusLabel = makeLabel("Ready. Enter token and project ID.", 80, Color3.fromRGB(85,85,85), 5)
	statusLabel.TextWrapped = true

	local div = Instance.new("Frame")
	div.Size             = UDim2.new(1,-24,0,1)
	div.BackgroundColor3 = Color3.fromRGB(30,30,30)
	div.BorderSizePixel  = 0
	div.LayoutOrder      = 6
	div.Parent           = scroll

	local previewBtn = makeButton("Preview Import  [+] [~] [=]",
		Color3.fromRGB(28,28,28), Color3.fromRGB(153,153,153), 7)

	local confirmBtn = makeButton("✓  Confirm & Import",
		Color3.fromRGB(35,35,35), Color3.fromRGB(255,255,255), 8)
	confirmBtn.Active = false

	makeLabel("", 4, nil, 9)
	local orphanBtn = makeButton("Remove Orphaned Elements",
		Color3.fromRGB(40,18,18), Color3.fromRGB(229,72,77), 10)

	makeLabel("Bloxig " .. PLUGIN_VERSION .. "  ·  bloxig.com",
		20, Color3.fromRGB(51,51,51), 11)

	-- ── State ─────────────────────────────────────────────────
	local pendingPayload = nil

	local function setStatus(msg, color)
		statusLabel.Text       = msg
		statusLabel.TextColor3 = color or Color3.fromRGB(153,153,153)
	end

	tokenBox.FocusLost:Connect(function()   saveToken(tokenBox.Text) end)
	projectBox.FocusLost:Connect(function() saveProjectId(projectBox.Text) end)

	-- ── Preview ───────────────────────────────────────────────
	previewBtn.MouseButton1Click:Connect(function()
		local token     = tokenBox.Text
		local projectId = projectBox.Text

		if token == "" then
			setStatus("⚠ Please enter your API token.", Color3.fromRGB(229,72,77)); return
		end
		if projectId == "" then
			setStatus("⚠ Please enter a Project ID.",  Color3.fromRGB(229,72,77)); return
		end

		setStatus("Fetching layout...", Color3.fromRGB(79,123,247))
		previewBtn.Active = false

		task.spawn(function()
			local payload, err = fetchLayout(projectId, token)
			if err then
				setStatus("✗ " .. err, Color3.fromRGB(229,72,77))
				previewBtn.Active = true
				return
			end

			pendingPayload = payload
			saveToken(token)
			saveProjectId(projectId)

			local container = getTargetContainer()
			local diff      = SmartMerge.preview(payload, container)
			setStatus(formatPreview(diff), Color3.fromRGB(153,153,153))

			-- Unlock confirm
			confirmBtn.Active = true
			confirmBtn.BackgroundColor3 = Color3.fromRGB(79,123,247)
			previewBtn.Active = true
		end)
	end)

	-- ════════════════════════════════════════════════════════════
	-- ✅ FIX 1 + FIX 2: Confirm — single apply + full tool chain
	-- ✅ FIX 3: Wrapped in ChangeHistoryService for undo support
	-- ════════════════════════════════════════════════════════════
	confirmBtn.MouseButton1Click:Connect(function()
		if not pendingPayload then
			setStatus("⚠ Run Preview first.", Color3.fromRGB(229,72,77)); return
		end

		setStatus("Importing...", Color3.fromRGB(79,123,247))
		confirmBtn.Active = false

		task.spawn(function()
			local container = getTargetContainer()

			-- ✅ FIX 3: Mark undo waypoint BEFORE changes
			ChangeHistory:SetWaypoint("Bloxig Import Start")

			-- ✅ FIX 1: Single apply call — stats captured correctly
			local stats, applyErr
			local ok = pcall(function()
				stats = SmartMerge.apply(pendingPayload, container)
			end)

			if not ok then
				setStatus("✗ Import failed:\n" .. tostring(applyErr or "unknown error"),
					Color3.fromRGB(229,72,77))
				confirmBtn.Active = true
				return
			end

			-- ✅ FIX 2: Run tool chain — Lock Text + Lock Stroke
			local locked = runToolChain(container, pendingPayload, stats)

			-- ✅ FIX 3: Mark undo waypoint AFTER all changes
			ChangeHistory:SetWaypoint("Bloxig Import Complete")

			setStatus(
				"✓ Import complete!\n" ..
				"  Created:  " .. (stats and stats.created  or 0) .. "\n" ..
				"  Merged:   " .. (stats and stats.merged   or 0) .. "\n" ..
				"  Orphans:  " .. (stats and stats.orphaned or 0) .. "\n" ..
				"  Locked text:   " .. locked.text .. "\n" ..
				"  Locked stroke: " .. locked.stroke,
				Color3.fromRGB(61,214,140)
			)

			pendingPayload = nil
			confirmBtn.Active = false
			confirmBtn.BackgroundColor3 = Color3.fromRGB(35,35,35)
		end)
	end)

	-- ── Orphan cleaner ────────────────────────────────────────
	orphanBtn.MouseButton1Click:Connect(function()
		local container = getTargetContainer()
		local removed   = 0

		ChangeHistory:SetWaypoint("Bloxig Remove Orphans Start")

		local function clean(inst)
			if inst:GetAttribute("Figblox_Orphan") == true then
				inst:Destroy(); removed = removed + 1; return
			end
			for _, child in ipairs(inst:GetChildren()) do clean(child) end
		end
		clean(container)

		ChangeHistory:SetWaypoint("Bloxig Remove Orphans Complete")
		setStatus("🗑 Removed " .. removed .. " orphaned element(s).",
			Color3.fromRGB(245,166,35))
	end)
end

buildUI()

widget:GetPropertyChangedSignal("Enabled"):Connect(function()
	if widget.Enabled then buildUI() end
end)

print("[Bloxig] Plugin v" .. PLUGIN_VERSION .. " loaded.")