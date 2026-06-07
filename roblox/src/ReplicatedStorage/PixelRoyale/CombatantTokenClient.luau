local Players = game:GetService("Players")

local WeaponConfig = require(script.Parent:WaitForChild("WeaponConfig"))

local CombatantTokenClient = {}

local TOKEN_Y = 0.92
local TOKEN_SIZE = 4.35
local POINTER_OFFSET = 3.25
local GUIDE_OFFSET = 8.1
local GUIDE_LENGTH = 12.6
local FOLDER_NAME = "_PixelRoyaleLocalTokens"

local localPlayer = Players.LocalPlayer
local folder: Folder? = nil
local tokens = {}

local function getFolder(): Folder
	if folder and folder.Parent then
		return folder
	end

	local existing = workspace:FindFirstChild(FOLDER_NAME)
	if existing and existing:IsA("Folder") then
		folder = existing
		return existing
	end

	local created = Instance.new("Folder")
	created.Name = FOLDER_NAME
	created.Parent = workspace
	folder = created
	return created
end

local function configurePart(part: BasePart, material)
	part.Anchored = true
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.CastShadow = false
	part.Material = material or Enum.Material.Neon
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
end

local function makePart(name: string, size: Vector3, color: Color3, transparency: number, material)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.Color = color
	part.Transparency = transparency
	configurePart(part, material)
	part.Parent = getFolder()
	return part
end

local function makeToken(player: Player)
	local model = Instance.new("Model")
	model.Name = "Token_" .. tostring(player.UserId)
	model.Parent = getFolder()

	local shadow = makePart("Shadow", Vector3.new(TOKEN_SIZE + 1.15, 0.1, TOKEN_SIZE + 1.15), Color3.fromRGB(0, 0, 0), 0.35, Enum.Material.SmoothPlastic)
	shadow.Parent = model

	local border = makePart("Border", Vector3.new(TOKEN_SIZE + 0.7, 0.28, TOKEN_SIZE + 0.7), Color3.fromRGB(4, 8, 14), 0.03, Enum.Material.Neon)
	border.Parent = model

	local body = makePart("Body", Vector3.new(TOKEN_SIZE, 0.48, TOKEN_SIZE), Color3.fromRGB(69, 243, 255), 0, Enum.Material.Neon)
	body.Parent = model

	local core = makePart("Core", Vector3.new(TOKEN_SIZE * 0.52, 0.55, TOKEN_SIZE * 0.52), Color3.fromRGB(255, 255, 255), 0.82, Enum.Material.Neon)
	core.Parent = model

	local pointer = makePart("AimPointer", Vector3.new(0.66, 0.58, 2.12), Color3.fromRGB(255, 255, 255), 0, Enum.Material.Neon)
	pointer.Parent = model

	local guide = makePart("AimGuide", Vector3.new(0.18, 0.1, GUIDE_LENGTH), Color3.fromRGB(69, 243, 255), 0.62, Enum.Material.Neon)
	guide.Parent = model

	tokens[player] = {
		model = model,
		shadow = shadow,
		border = border,
		body = body,
		core = core,
		pointer = pointer,
		guide = guide,
	}

	return tokens[player]
end

local function getCharacterRoot(player: Player)
	local character = player.Character
	if not character then
		return nil, nil
	end

	local humanoid = character:FindFirstChildOfClass("Humanoid")
	local root = character:FindFirstChild("HumanoidRootPart")
	if not humanoid or not root or humanoid.Health <= 0 then
		return nil, nil
	end

	return humanoid, root
end

local function setVisible(token, visible: boolean)
	token.shadow.Transparency = visible and 0.35 or 1
	token.border.Transparency = visible and 0.03 or 1
	token.body.Transparency = visible and 0 or 1
	token.core.Transparency = visible and 0.82 or 1
	token.pointer.Transparency = visible and 0 or 1
	token.guide.Transparency = visible and 0.62 or 1
end

local function safeFlat(vector: Vector3?, fallback: Vector3): Vector3
	if not vector then
		return fallback
	end

	local flat = Vector3.new(vector.X, 0, vector.Z)
	if flat.Magnitude <= 0.01 then
		return fallback
	end

	return flat.Unit
end

local function getAimDirection(player: Player, root: BasePart, localAim: Vector3?): Vector3
	local rootDirection = safeFlat(root.CFrame.LookVector, Vector3.new(0, 0, -1))
	if player == localPlayer then
		return safeFlat(localAim, rootDirection)
	end

	local aimX = player:GetAttribute("AimX")
	local aimZ = player:GetAttribute("AimZ")
	if typeof(aimX) == "number" and typeof(aimZ) == "number" then
		return safeFlat(Vector3.new(aimX, 0, aimZ), rootDirection)
	end

	return rootDirection
end

function CombatantTokenClient.updateAll(localAim: Vector3?)
	for _, player in ipairs(Players:GetPlayers()) do
		local token = tokens[player] or makeToken(player)
		local _, root = getCharacterRoot(player)
		if not root then
			setVisible(token, false)
			continue
		end

		local weapon = WeaponConfig.getWeapon(player:GetAttribute("Weapon") or WeaponConfig.DefaultWeapon)
		local direction = getAimDirection(player, root, localAim)
		local position = Vector3.new(root.Position.X, TOKEN_Y, root.Position.Z)
		local cframe = CFrame.lookAt(position, position + direction)

		token.body.Color = weapon.color
		token.guide.Color = weapon.color
		token.shadow.CFrame = cframe * CFrame.new(0, -0.36, 0)
		token.border.CFrame = cframe * CFrame.new(0, -0.18, 0)
		token.body.CFrame = cframe
		token.core.CFrame = cframe * CFrame.new(0, 0.12, 0)
		token.pointer.CFrame = cframe * CFrame.new(0, 0.14, -POINTER_OFFSET)
		token.guide.CFrame = cframe * CFrame.new(0, -0.16, -GUIDE_OFFSET)
		setVisible(token, true)
	end
end

function CombatantTokenClient.cleanupPlayer(player: Player)
	local token = tokens[player]
	if not token then
		return
	end

	token.model:Destroy()
	tokens[player] = nil
end

Players.PlayerRemoving:Connect(CombatantTokenClient.cleanupPlayer)

return CombatantTokenClient
