-- ============================================================
-- ImageUploader.lua — Bloxig v2.0  (SERVER-SIDE upload client)
--
-- WHY v2.0 IS DIFFERENT:
-- Roblox Studio plugins CANNOT call apis.roblox.com via HttpService
-- ("HttpService is not allowed to access that Roblox resource"). So the
-- plugin can't upload to Open Cloud directly. Instead, this module sends
-- the images + the user's Open Cloud API key to the BLOXIG SERVER, which
-- does the actual Open Cloud upload (the server has no such restriction)
-- and returns a { imageName -> "rbxassetid://id" } map.
--
-- The Bloxig server endpoint is POST /api/upload-images. The user's API
-- key is used transiently on the server and never stored.
--
-- Returns: imageMap, errors
-- ============================================================

local HttpService = game:GetService("HttpService")

local ImageUploader = {}

-- ════════════════════════════════════════════════════════════
-- PUBLIC: uploadAll
-- @param images     table   { imageName = base64png, ... } from payload.images
-- @param apiKey     string  user's Open Cloud API key
-- @param userId     string|number  user's Roblox user id
-- @param serverUrl  string  Bloxig server base (e.g. https://bloxig.onrender.com)
-- @param token      string  Bloxig JWT (same one used for import auth)
-- @param onProgress function(stage)  optional UI callback (stage = string)
-- @return imageMap table { imageName = "rbxassetid://id" }, errors table
-- ════════════════════════════════════════════════════════════
function ImageUploader.uploadAll(images, apiKey, userId, serverUrl, token, onProgress)
	local imageMap = {}
	local errors   = {}

	if not images then return imageMap, errors end

	-- Count images
	local count = 0
	for _ in pairs(images) do count = count + 1 end
	if count == 0 then return imageMap, errors end

	if not apiKey or apiKey == "" then
		return imageMap, { "No API key provided." }
	end
	if not userId or tostring(userId) == "" then
		return imageMap, { "No Roblox user ID provided." }
	end

	if onProgress then
		onProgress(string.format("Uploading %d image(s) via Bloxig server...", count))
	end

	local body = HttpService:JSONEncode({
		images = images,
		apiKey = apiKey,
		userId = tostring(userId)
	})

	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url     = serverUrl .. "/api/upload-images",
			Method  = "POST",
			Headers = {
				["Content-Type"]  = "application/json",
				["Authorization"] = "Bearer " .. token
			},
			Body = body
		})
	end)

	if not ok then
		return imageMap, { "network: " .. tostring(res) }
	end

	if not res.Success or res.StatusCode ~= 200 then
		local msg = "server error " .. tostring(res.StatusCode)
		local okJson, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
		if okJson and data and data.error then
			msg = msg .. ": " .. tostring(data.error)
		end
		return imageMap, { msg }
	end

	local okJson, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
	if not okJson or not data then
		return imageMap, { "bad server response" }
	end

	imageMap = data.imageMap or {}
	errors   = data.errors   or {}

	if onProgress then onProgress("done") end
	return imageMap, errors
end

return ImageUploader
