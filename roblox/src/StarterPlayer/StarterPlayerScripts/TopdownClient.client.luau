local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera

local PixelRoyale = ReplicatedStorage:WaitForChild("PixelRoyale")
local WeaponConfig = require(PixelRoyale:WaitForChild("WeaponConfig"))
local EffectsClient = require(PixelRoyale:WaitForChild("EffectsClient"))
local CombatantTokenClient = require(PixelRoyale:WaitForChild("CombatantTokenClient"))
local CombatRemote = PixelRoyale:WaitForChild("Remotes"):WaitForChild("Combat")

local CAMERA_POSITION = Vector3.new(0, 165, 0)
local CAMERA_TARGET = Vector3.new(0, 0, 0)
local CAMERA_UP = Vector3.new(0, 0, -1)
local AIM_PLANE_Y = 0.55

local aimDirection = Vector3.new(0, 0, -1)
local lastAimSent = 0
local selectedWeapon = WeaponConfig.DefaultWeapon

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "PixelRoyaleHud"
screenGui.ResetOnSpawn = false
screenGui.Parent = player:WaitForChild("PlayerGui")

local statusFrame = Instance.new("Frame")
statusFrame.Name = "Status"
statusFrame.Size = UDim2.fromOffset(280, 118)
statusFrame.Position = UDim2.fromOffset(18, 18)
statusFrame.BackgroundColor3 = Color3.fromRGB(21, 29, 39)
statusFrame.BorderColor3 = Color3.fromRGB(69, 243, 255)
statusFrame.BorderSizePixel = 2
statusFrame.Parent = screenGui

local titleLabel = Instance.new("TextLabel")
titleLabel.Name = "Title"
titleLabel.Size = UDim2.fromOffset(250, 30)
titleLabel.Position = UDim2.fromOffset(14, 10)
titleLabel.BackgroundTransparency = 1
titleLabel.TextXAlignment = Enum.TextXAlignment.Left
titleLabel.Font = Enum.Font.GothamBold
titleLabel.TextSize = 18
titleLabel.TextColor3 = Color3.fromRGB(245, 245, 245)
titleLabel.Text = "PIXELROYALE"
titleLabel.Parent = statusFrame

local hpBack = Instance.new("Frame")
hpBack.Name = "HpBack"
hpBack.Size = UDim2.fromOffset(250, 18)
hpBack.Position = UDim2.fromOffset(14, 44)
hpBack.BackgroundColor3 = Color3.fromRGB(52, 60, 72)
hpBack.BorderSizePixel = 0
hpBack.Parent = statusFrame

local hpFill = Instance.new("Frame")
hpFill.Name = "HpFill"
hpFill.Size = UDim2.fromScale(1, 1)
hpFill.BackgroundColor3 = Color3.fromRGB(245, 22, 45)
hpFill.BorderSizePixel = 0
hpFill.Parent = hpBack

local hpText = Instance.new("TextLabel")
hpText.Name = "HpText"
hpText.Size = UDim2.fromScale(1, 1)
hpText.BackgroundTransparency = 1
hpText.Font = Enum.Font.GothamBold
hpText.TextSize = 14
hpText.TextColor3 = Color3.fromRGB(255, 255, 255)
hpText.Text = "0 / 0"
hpText.Parent = hpBack

local weaponLabel = Instance.new("TextLabel")
weaponLabel.Name = "Weapon"
weaponLabel.Size = UDim2.fromOffset(250, 30)
weaponLabel.Position = UDim2.fromOffset(14, 72)
weaponLabel.BackgroundTransparency = 1
weaponLabel.TextXAlignment = Enum.TextXAlignment.Left
weaponLabel.Font = Enum.Font.Gotham
weaponLabel.TextSize = 15
weaponLabel.TextColor3 = Color3.fromRGB(102, 252, 241)
weaponLabel.Text = "Weapon: 검"
weaponLabel.Parent = statusFrame

local attackButton = Instance.new("TextButton")
attackButton.Name = "AttackButton"
attackButton.Size = UDim2.fromOffset(118, 118)
attackButton.AnchorPoint = Vector2.new(1, 1)
attackButton.Position = UDim2.new(1, -26, 1, -26)
attackButton.BackgroundColor3 = Color3.fromRGB(24, 30, 40)
attackButton.BorderColor3 = Color3.fromRGB(255, 78, 86)
attackButton.BorderSizePixel = 3
attackButton.Font = Enum.Font.GothamBold
attackButton.TextSize = 19
attackButton.TextColor3 = Color3.fromRGB(255, 255, 255)
attackButton.Text = "공격"
attackButton.Parent = screenGui

local weaponPanel = Instance.new("Frame")
weaponPanel.Name = "WeaponPanel"
weaponPanel.Size = UDim2.fromOffset(148, 420)
weaponPanel.Position = UDim2.fromOffset(18, 144)
weaponPanel.BackgroundColor3 = Color3.fromRGB(12, 14, 20)
weaponPanel.BackgroundTransparency = 0.08
weaponPanel.BorderColor3 = Color3.fromRGB(69, 243, 255)
weaponPanel.BorderSizePixel = 1
weaponPanel.Parent = screenGui

local list = Instance.new("UIListLayout")
list.Padding = UDim.new(0, 6)
list.SortOrder = Enum.SortOrder.LayoutOrder
list.Parent = weaponPanel

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 8)
padding.PaddingLeft = UDim.new(0, 8)
padding.PaddingRight = UDim.new(0, 8)
padding.PaddingBottom = UDim.new(0, 8)
padding.Parent = weaponPanel

local weaponButtons: { [string]: TextButton } = {}

local function getHumanoid()
	local character = player.Character
	if not character then
		return nil
	end
	return character:FindFirstChildOfClass("Humanoid")
end

local function getRoot()
	local character = player.Character
	if not character then
		return nil
	end
	return character:FindFirstChild("HumanoidRootPart")
end

local function updateWeaponButtons()
	for weaponId, button in pairs(weaponButtons) do
		local active = weaponId == selectedWeapon
		button.BackgroundColor3 = active and Color3.fromRGB(22, 48, 56) or Color3.fromRGB(22, 24, 31)
		button.BorderColor3 = active and Color3.fromRGB(69, 243, 255) or Color3.fromRGB(64, 75, 90)
	end
end

local function setWeapon(weaponId: string)
	local weapon = WeaponConfig.getWeapon(weaponId)
	selectedWeapon = weaponId
	weaponLabel.Text = "Weapon: " .. weapon.displayName
	updateWeaponButtons()
	CombatRemote:FireServer("SetWeapon", weaponId)
end

for index, weaponId in ipairs(WeaponConfig.Order) do
	local weapon = WeaponConfig.getWeapon(weaponId)
	local button = Instance.new("TextButton")
	button.Name = weaponId
	button.LayoutOrder = index
	button.Size = UDim2.new(1, 0, 0, 26)
	button.BackgroundColor3 = Color3.fromRGB(22, 24, 31)
	button.BorderColor3 = Color3.fromRGB(64, 75, 90)
	button.BorderSizePixel = 1
	button.Font = Enum.Font.GothamBold
	button.TextSize = 13
	button.TextColor3 = weapon.color
	button.TextXAlignment = Enum.TextXAlignment.Left
	button.Text = "  " .. weapon.displayName
	button.Parent = weaponPanel
	button.MouseButton1Click:Connect(function()
		setWeapon(weaponId)
	end)
	weaponButtons[weaponId] = button
end
updateWeaponButtons()

local function updateHealth()
	local humanoid = getHumanoid()
	if not humanoid then
		return
	end

	local maxHealth = math.max(humanoid.MaxHealth, 1)
	local ratio = math.clamp(humanoid.Health / maxHealth, 0, 1)
	hpFill.Size = UDim2.fromScale(ratio, 1)
	hpText.Text = string.format("%d / %d", math.ceil(humanoid.Health), math.ceil(maxHealth))
end

local function bindCharacter(character: Model)
	local humanoid = character:WaitForChild("Humanoid", 10)
	if humanoid then
		humanoid.AutoRotate = false
		humanoid.HealthChanged:Connect(updateHealth)
		humanoid:GetPropertyChangedSignal("MaxHealth"):Connect(updateHealth)
		updateHealth()
	end
end

if player.Character then
	bindCharacter(player.Character)
end
player.CharacterAdded:Connect(bindCharacter)

local function computeAim(root)
	local mouseLocation = UserInputService:GetMouseLocation()
	local ray = camera:ViewportPointToRay(mouseLocation.X, mouseLocation.Y)
	if math.abs(ray.Direction.Y) <= 0.001 then
		return aimDirection
	end

	local t = (AIM_PLANE_Y - ray.Origin.Y) / ray.Direction.Y
	if t <= 0 then
		return aimDirection
	end

	local hit = ray.Origin + ray.Direction * t
	local flat = Vector3.new(hit.X - root.Position.X, 0, hit.Z - root.Position.Z)
	if flat.Magnitude <= 0.01 then
		return aimDirection
	end
	return flat.Unit
end

local function attack()
	CombatRemote:FireServer("Attack")
end

attackButton.MouseButton1Click:Connect(attack)

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end

	if input.UserInputType == Enum.UserInputType.MouseButton1 then
		attack()
	end
end)

CombatRemote.OnClientEvent:Connect(function(action: string, payload)
	if action == "AttackEffect" and typeof(payload) == "table" then
		EffectsClient.drawAttackEffect(payload)
	end
end)

RunService.RenderStepped:Connect(function()
	local root = getRoot()
	if not root then
		return
	end

	camera.CameraType = Enum.CameraType.Scriptable
	camera.FieldOfView = 50
	camera.CFrame = CFrame.lookAt(CAMERA_POSITION, CAMERA_TARGET, CAMERA_UP)
	CombatantTokenClient.updateAll()

	aimDirection = computeAim(root)
	root.CFrame = CFrame.lookAt(root.Position, root.Position + aimDirection)

	local now = os.clock()
	if now - lastAimSent >= 0.05 then
		lastAimSent = now
		CombatRemote:FireServer("SetAim", aimDirection)
	end

	updateHealth()
end)
