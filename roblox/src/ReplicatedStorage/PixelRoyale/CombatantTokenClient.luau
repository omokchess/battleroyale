local Players = game:GetService("Players")

local WeaponConfig = require(script.Parent:WaitForChild("WeaponConfig"))

local CombatantTokenClient = {}

local TOKEN_Y = 0.92
local TOKEN_SIZE = 4.25
local POINTER_OFFSET = 3.25
local FOLDER_NAME = "_PixelRoyaleLocalTokens"

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

local function configurePart(part: BasePart)
	part.Anchored = true
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.CastShadow = false
	part.Material = Enum.Material.Neon
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
end

local function makeToken(player: Player)
	local model = Instance.new("Model")
	model.Name = `Token_{player.UserId}`
	model.Parent = getFolder()

	local border = Instance.new("Part")
	border.Name = "Border"
	border.Size = Vector3.new(TOKEN_SIZE + 0.72, 0.26, TOKEN_SIZE + 0.72)
	border.Color = Color3.fromRGB(3, 5, 9)
	border.Transparency = 0.04
	configurePart(border)
	border.Parent = model

	local body = Instance.new("Part")
	body.Name = "Body"
	body.Size = Vector3.new(TOKEN_SIZE, 0.46, TOKEN_SIZE)
	body.Color = Color3.fromRGB(69, 243, 255)
	body.Transparency = 0
	configurePart(body)
	body.Parent = model

	local pointer = Instance.new("Part")
	pointer.Name = "AimPointer"
	pointer.Size = Vector3.new(0.62, 0.54, 2.1)
	pointer.Color = Color3.fromRGB(255, 255, 255)
	pointer.Transparency = 0
	configurePart(pointer)
	pointer.Parent = model

	local nameBillboard = Instance.new("BillboardGui")
	nameBillboard.Name = "Name"
	nameBillboard.Size = UDim2.fromOffset(120, 24)
	nameBillboard.StudsOffsetWorldSpace = Vector3.new(0, 3.7, 0)
	nameBillboard.AlwaysOnTop = true
	nameBillboard.Parent = body

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Size = UDim2.fromScale(1, 1)
	nameLabel.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
	nameLabel.BackgroundTransparency = 0.35
	nameLabel.BorderSizePixel = 0
	nameLabel.Font = Enum.Font.GothamBold
	nameLabel.TextSize = 12
	nameLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
	nameLabel.Text = player.DisplayName
	nameLabel.Parent = nameBillboard

	tokens[player] = {
		model = model,
		border = border,
		body = body,
		pointer = pointer,
		label = nameLabel,
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
	token.border.Transparency = visible and 0.04 or 1
	token.body.Transparency = visible and 0 or 1
	token.pointer.Transparency = visible and 0 or 1
	token.label.Visible = visible
end

local function getFlatDirection(root: BasePart): Vector3
	local look = root.CFrame.LookVector
	local direction = Vector3.new(look.X, 0, look.Z)
	if direction.Magnitude <= 0.01 then
		return Vector3.new(0, 0, -1)
	end
	return direction.Unit
end

function CombatantTokenClient.updateAll()
	for _, player in ipairs(Players:GetPlayers()) do
		local token = tokens[player] or makeToken(player)
		local _, root = getCharacterRoot(player)
		if not root then
			setVisible(token, false)
			continue
		end

		local weapon = WeaponConfig.getWeapon(player:GetAttribute("Weapon") or WeaponConfig.DefaultWeapon)
		local direction = getFlatDirection(root)
		local position = Vector3.new(root.Position.X, TOKEN_Y, root.Position.Z)
		local cframe = CFrame.lookAt(position, position + direction)

		token.body.Color = weapon.color
		token.border.CFrame = cframe * CFrame.new(0, -0.18, 0)
		token.body.CFrame = cframe
		token.pointer.CFrame = cframe * CFrame.new(0, 0.12, -POINTER_OFFSET)
		token.label.Text = `{player.DisplayName} [{player:GetAttribute("WeaponName") or weapon.displayName}]`
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

