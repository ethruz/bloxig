-- ============================================================
-- Main.lua
-- Bloxig Roblox Studio Plugin — Entry Point
--
-- Handles:
--   · Plugin toolbar button + widget UI
--   · JWT token storage (plugin settings)
--   · HttpService fetch from Bloxig server
--   · Import preview [+] new  [~] changed  [=] synced
--   · Calls SmartMerge.apply() on confirm
-- ============================================================

local HttpService    = game:GetService("HttpService")
local StarterGui     = game:GetService("StarterGui")
local StudioService  = game:GetService("StudioService")
local Selection      = game:GetService("Selection")

local SmartMerge     = require(script.Parent.SmartMerge)
local Generator      = require(script.Parent.Generator)

-- ── Plugin identity ───────────────────────────────────────────
local PLUGIN_NAME    = "Bloxig"
local PLUGIN_VERSION = "1.0.0"
local SERVER_URL     = "http://localhost:3000" -- change to https://bloxig.com in production

-- ── Toolbar + Button ──────────────────────────────────────────
local toolbar = plugin:CreateToolbar(PLUGIN_NAME)
local button  = toolbar:CreateButton(
	"Bloxig Import",
	"Import Figma layout into Studio",
	"rbxassetid://0" -- replace with real icon asset ID
)

-- ── Plugin Widget (the side panel UI) ────────────────────────
local widgetInfo = DockWidgetPluginGuiInfo.new(
	Enum.InitialDockState.Right,
	false, -- initially hidden
	false,
	300,   -- width
	520,   -- height
	280,
	400
)

local widget = plugin:CreateDockWidgetPluginGui("BloxigWidget", widgetInfo)
widget.Title = "Bloxig"
widget.Enabled = false

-- ── Toggle widget on button click ────────────────────────────
button.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

-- ── Persistent token storage ──────────────────────────────────
local function saveToken(token)
	plugin:SetSetting("BloxigToken", token)
end

local function loadToken()
	return plugin:GetSetting("BloxigToken") or ""
end

local function saveProjectId(id)
	plugin:SetSetting("BloxigProjectId", id)
end

local function loadProjectId()
	return plugin:GetSetting("BloxigProjectId") or ""
end

-- ── HTTP helpers ──────────────────────────────────────────────
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
		return nil, "Network error: " .. tostring(response) ..
		             "\nIs the Bloxig server running?"
	end

	if response.StatusCode == 401 then
		return nil, "Invalid token. Please check your Bloxig API token."
	end

	if response.StatusCode == 404 then
		return nil, "Project not found. Check your Project ID."
	end

	if response.StatusCode ~= 200 then
		return nil, "Server error " .. response.StatusCode .. ": " .. response.Body
	end

	local parsed, err = pcall(function()
		return HttpService:JSONDecode(response.Body)
	end)

	if not parsed then
		return nil, "Could not parse server response."
	end

	local data = HttpService:JSONDecode(response.Body)
	if not data.success or not data.json_layout_data then
		return nil, "Server returned empty layout."
	end

	return data.json_layout_data, nil
end

-- ── Find or create ScreenGui ──────────────────────────────────
local function getTargetContainer()
	-- Prefer selected ScreenGui, fallback to StarterGui
	local selected = Selection:Get()
	for _, inst in ipairs(selected) do
		if inst:IsA("ScreenGui") then return inst end
	end

	-- Look for existing BloxigGui
	local existing = StarterGui:FindFirstChild("BloxigGui")
	if existing then return existing end

	-- Create a fresh one
	local gui = Instance.new("ScreenGui")
	gui.Name             = "BloxigGui"
	gui.ResetOnSpawn     = false
	gui.ZIndexBehavior   = Enum.ZIndexBehavior.Sibling
	gui.Parent           = StarterGui
	return gui
end

-- ── Format preview results for display ───────────────────────
local function formatPreview(diff)
	local lines = {}
	table.insert(lines, "━━ Import Preview ━━")
	table.insert(lines, "[+] New:     " .. #diff.new)
	table.insert(lines, "[~] Changed: " .. #diff.changed)
	table.insert(lines, "[=] Synced:  " .. #diff.synced)
	table.insert(lines, "")

	if #diff.new > 0 then
		table.insert(lines, "NEW elements:")
		for i, item in ipairs(diff.new) do
			if i > 5 then table.insert(lines, "  ...and " .. (#diff.new-5) .. " more"); break end
			table.insert(lines, "  + " .. (item.name or item.id))
		end
	end

	if #diff.changed > 0 then
		table.insert(lines, "CHANGED elements:")
		for i, item in ipairs(diff.changed) do
			if i > 5 then table.insert(lines, "  ...and " .. (#diff.changed-5) .. " more"); break end
			table.insert(lines, "  ~ " .. (item.name or item.id))
		end
	end

	return table.concat(lines, "\n")
end

-- ── Build the plugin widget UI ────────────────────────────────
local function buildUI()
	-- Clear existing
	for _, c in ipairs(widget:GetChildren()) do c:Destroy() end

	local bg = Instance.new("Frame")
	bg.Size                  = UDim2.new(1,0,1,0)
	bg.BackgroundColor3      = Color3.fromRGB(18,18,18)
	bg.BorderSizePixel       = 0
	bg.Parent                = widget

	-- Header
	local header = Instance.new("Frame")
	header.Size              = UDim2.new(1,0,0,48)
	header.BackgroundColor3  = Color3.fromRGB(12,12,12)
	header.BorderSizePixel   = 0
	header.Parent            = bg

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

	-- Scroll content
	local scroll = Instance.new("ScrollingFrame")
	scroll.Size              = UDim2.new(1,0,1,-48)
	scroll.Position          = UDim2.new(0,0,0,48)
	scroll.BackgroundTransparency = 1
	scroll.ScrollBarThickness = 4
	scroll.ScrollBarImageColor3 = Color3.fromRGB(80,80,80)
	scroll.CanvasSize        = UDim2.new(0,0,0,600)
	scroll.Parent            = bg

	local layout = Instance.new("UIListLayout")
	layout.SortOrder         = Enum.SortOrder.LayoutOrder
	layout.Padding           = UDim.new(0, 8)
	layout.Parent            = scroll

	local padding = Instance.new("UIPadding")
	padding.PaddingLeft      = UDim.new(0,12)
	padding.PaddingRight     = UDim.new(0,12)
	padding.PaddingTop       = UDim.new(0,12)
	padding.Parent           = scroll

	-- Helper: make a label
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

	-- Helper: make an input box
	local function makeInput(placeholder, defaultVal, order)
		local box = Instance.new("TextBox")
		box.PlaceholderText  = placeholder
		box.Text             = defaultVal or ""
		box.Size             = UDim2.new(1,-24,0,34)
		box.BackgroundColor3 = Color3.fromRGB(28,28,28)
		box.BorderSizePixel  = 0
		box.TextColor3       = Color3.fromRGB(239,239,239)
		box.PlaceholderColor3 = Color3.fromRGB(85,85,85)
		box.TextSize         = 12
		box.Font             = Enum.Font.Code
		box.ClearTextOnFocus = false
		box.LayoutOrder      = order or 0
		box.Parent           = scroll

		local corner = Instance.new("UICorner")
		corner.CornerRadius  = UDim.new(0, 6)
		corner.Parent        = box

		local pad = Instance.new("UIPadding")
		pad.PaddingLeft      = UDim.new(0, 8)
		pad.Parent           = box

		return box
	end

	-- Helper: make a button
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

		local corner = Instance.new("UICorner")
		corner.CornerRadius  = UDim.new(0, 6)
		corner.Parent        = btn

		return btn
	end

	-- ── UI Fields ─────────────────────────────────────────────
	makeLabel("API TOKEN", 16, Color3.fromRGB(85,85,85), 1)
	local tokenBox = makeInput("Paste token from bloxig.com/dashboard", loadToken(), 2)

	makeLabel("PROJECT ID", 16, Color3.fromRGB(85,85,85), 3)
	local projectBox = makeInput("e.g. 6650f3a2c1234abcd", loadProjectId(), 4)

	-- Status display
	local statusLabel = makeLabel("Ready. Enter token and project ID.", 80, Color3.fromRGB(85,85,85), 5)
	statusLabel.TextWrapped = true

	-- Divider
	local div = Instance.new("Frame")
	div.Size             = UDim2.new(1,-24,0,1)
	div.BackgroundColor3 = Color3.fromRGB(30,30,30)
	div.BorderSizePixel  = 0
	div.LayoutOrder      = 6
	div.Parent           = scroll

	-- Preview button
	local previewBtn = makeButton("Preview Import  [+] [~] [=]",
		Color3.fromRGB(28,28,28), Color3.fromRGB(153,153,153), 7)

	-- Confirm button
	local confirmBtn = makeButton("✓  Confirm & Import",
		Color3.fromRGB(79,123,247), Color3.fromRGB(255,255,255), 8)
	confirmBtn.Active = false
	confirmBtn.BackgroundColor3 = Color3.fromRGB(35,35,35)

	-- Orphan cleaner button
	makeLabel("", 4, nil, 9)
	local orphanBtn = makeButton("Remove Orphaned Elements",
		Color3.fromRGB(40,18,18), Color3.fromRGB(229,72,77), 10)

	-- Version label
	makeLabel("Bloxig " .. PLUGIN_VERSION .. "  ·  bloxig.com",
		20, Color3.fromRGB(51,51,51), 11)

	-- ── State ─────────────────────────────────────────────────
	local pendingPayload = nil

	local function setStatus(msg, color)
		statusLabel.Text       = msg
		statusLabel.TextColor3 = color or Color3.fromRGB(153,153,153)
	end

	-- ── Save token/project on change ──────────────────────────
	tokenBox.FocusLost:Connect(function()
		saveToken(tokenBox.Text)
	end)
	projectBox.FocusLost:Connect(function()
		saveProjectId(projectBox.Text)
	end)

	-- ── Preview button ────────────────────────────────────────
	previewBtn.MouseButton1Click:Connect(function()
		local token     = tokenBox.Text
		local projectId = projectBox.Text

		if token == "" then
			setStatus("⚠ Please enter your API token.", Color3.fromRGB(229,72,77))
			return
		end
		if projectId == "" then
			setStatus("⚠ Please enter a Project ID.", Color3.fromRGB(229,72,77))
			return
		end

		setStatus("Fetching layout from server...", Color3.fromRGB(79,123,247))
		previewBtn.Active = false

		-- Fetch in a coroutine so UI doesn't freeze
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

			-- Run preview diff
			local container = getTargetContainer()
			local diff      = SmartMerge.preview(payload, container)
			local preview   = formatPreview(diff)

			setStatus(preview, Color3.fromRGB(153,153,153))

			-- Unlock confirm button
			confirmBtn.Active = true
			confirmBtn.BackgroundColor3 = Color3.fromRGB(79,123,247)
			previewBtn.Active = true
		end)
	end)

	-- ── Confirm button ────────────────────────────────────────
	confirmBtn.MouseButton1Click:Connect(function()
		if not pendingPayload then
			setStatus("⚠ Run Preview first.", Color3.fromRGB(229,72,77))
			return
		end

		setStatus("Importing...", Color3.fromRGB(79,123,247))
		confirmBtn.Active = false

		task.spawn(function()
			local container = getTargetContainer()
			local ok, err   = pcall(function()
				SmartMerge.apply(pendingPayload, container)
			end)

			if not ok then
				setStatus("✗ Import failed:\n" .. tostring(err), Color3.fromRGB(229,72,77))
			else
				local stats = SmartMerge.apply(pendingPayload, container)
				setStatus(
					"✓ Import complete!\n" ..
					"  Created: "  .. (stats and stats.created  or "?") .. "\n" ..
					"  Merged:  "  .. (stats and stats.merged   or "?") .. "\n" ..
					"  Orphans: "  .. (stats and stats.orphaned or "?"),
					Color3.fromRGB(61,214,140)
				)
			end

			pendingPayload = nil
			confirmBtn.Active = false
			confirmBtn.BackgroundColor3 = Color3.fromRGB(35,35,35)
		end)
	end)

	-- ── Orphan cleaner ────────────────────────────────────────
	orphanBtn.MouseButton1Click:Connect(function()
		local container = getTargetContainer()
		local removed   = 0

		local function clean(inst)
			if inst:GetAttribute("Figblox_Orphan") == true then
				inst:Destroy()
				removed = removed + 1
				return
			end
			for _, child in ipairs(inst:GetChildren()) do
				clean(child)
			end
		end

		clean(container)
		setStatus("🗑 Removed " .. removed .. " orphaned element(s).",
			Color3.fromRGB(245,166,35))
	end)
end

-- Build UI when plugin loads
buildUI()

-- Rebuild UI if widget is re-enabled (keeps state fresh)
widget:GetPropertyChangedSignal("Enabled"):Connect(function()
	if widget.Enabled then
		buildUI()
	end
end)

print("[Bloxig] Plugin v" .. PLUGIN_VERSION .. " loaded. Click the toolbar button to open.")