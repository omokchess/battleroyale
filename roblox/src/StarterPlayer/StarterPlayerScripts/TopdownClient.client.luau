local Players = game:GetService("Players")
local ContextActionService = game:GetService("ContextActionService")
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
local ARENA_HALF_SIZE = 66

local STONE = Color3.fromRGB(27, 22, 34)
local DARK = Color3.fromRGB(11, 12, 16)
local BRASS = Color3.fromRGB(168, 132, 44)
local GOLD = Color3.fromRGB(216, 178, 74)
local GRAY = Color3.fromRGB(156, 163, 175)
local WHITE = Color3.fromRGB(240, 240, 245)
local GREEN = Color3.fromRGB(74, 222, 128)
local HUD_FONT = Enum.Font.Code

local Dash = WeaponConfig.Dash
local aimDirection = Vector3.new(0, 0, -1)
local aimPoint = Vector3.new(0, AIM_PLANE_Y, -1)
local lastAimSent = 0
local selectedWeapon = WeaponConfig.DefaultWeapon
local inGame = false
local heldMoveKeys = {}
local dashUntil = 0
local dashReadyAt = 0
local dashDir = Vector3.new(0, 0, -1)
local skillReadyAt = 0
local skillCooldown = 0
local altReadyAt = 0
local altCooldown = 0
local chargingGreatsword = false
local greatswordChargeStart = 0
local chargingKatana = false
local katanaChargeStart = 0
local qteState = nil

local BUFF_WEAPONS = { axe = true, gauntlet = true, rapier = true }
local NO_BASIC_ATTACK = { greatsword = true, matchlock = true, sniper = true }

local MOVE_KEYS = {
	[Enum.KeyCode.W] = Vector3.new(0, 0, -1),
	[Enum.KeyCode.Up] = Vector3.new(0, 0, -1),
	[Enum.KeyCode.S] = Vector3.new(0, 0, 1),
	[Enum.KeyCode.Down] = Vector3.new(0, 0, 1),
	[Enum.KeyCode.A] = Vector3.new(-1, 0, 0),
	[Enum.KeyCode.Left] = Vector3.new(-1, 0, 0),
	[Enum.KeyCode.D] = Vector3.new(1, 0, 0),
	[Enum.KeyCode.Right] = Vector3.new(1, 0, 0),
}

local function skillCooldownFor(id: string): number
	local sk = WeaponConfig.Skill[id]
	if not sk then
		return 0
	end
	if BUFF_WEAPONS[id] then
		return (sk.buff or 0) + (sk.cooldown or 0)
	end
	if id == "magicstaff" then
		return WeaponConfig.Magic.fireball.cooldown
	end
	return sk.cooldown or 0
end

local function skillLabelFor(id: string): string
	if id == "greatsword" then
		return "CHARGE"
	elseif id == "dagger" then
		return "QTE"
	elseif id == "bow" then
		return "RAIL"
	elseif id == "magicstaff" then
		return "FIRE"
	end
	return "SKILL"
end

local function altCooldownFor(id: string): number
	if id == "sniper" then
		return WeaponConfig.Skill.sniper.teleportCooldown
	elseif id == "magicstaff" then
		return WeaponConfig.Magic.lifebound.cooldown
	elseif id == "katana" then
		return WeaponConfig.Skill.katana.iaijutsuCooldown
	end
	local alt = WeaponConfig.AltSkill and WeaponConfig.AltSkill[id]
	return alt and alt.cooldown or 0
end

local function altLabelFor(id: string): string
	if id == "sniper" then
		return "BLINK"
	elseif id == "magicstaff" then
		return "HEAL"
	elseif id == "katana" then
		return "IAI"
	end
	return "R-SKILL"
end

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "PixelRoyaleHud"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.Parent = player:WaitForChild("PlayerGui")

local function stonePanel(name: string): Frame
	local f = Instance.new("Frame")
	f.Name = name
	f.BackgroundColor3 = STONE
	f.BackgroundTransparency = 0.1
	f.BorderColor3 = BRASS
	f.BorderSizePixel = 2
	f.Parent = screenGui
	return f
end

local function label(parent: Instance, text: string, size: UDim2, pos: UDim2, color: Color3, sz: number, bold: boolean?): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = size
	l.Position = pos
	l.Font = if bold then Enum.Font.Code else HUD_FONT
	l.TextSize = sz
	l.TextColor3 = color
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.Text = text
	l.Parent = parent
	return l
end

local playerPanel = stonePanel("PlayerPanel")
playerPanel.Size = UDim2.fromOffset(340, 144)
playerPanel.Position = UDim2.fromOffset(16, 16)

local nameLabel = label(playerPanel, "PLAYER", UDim2.fromOffset(194, 26), UDim2.fromOffset(14, 10), WHITE, 22, true)
local weaponTag = label(playerPanel, "SWORD", UDim2.fromOffset(112, 26), UDim2.fromOffset(214, 10), GOLD, 15, true)
weaponTag.TextXAlignment = Enum.TextXAlignment.Right
weaponTag.BackgroundColor3 = DARK
weaponTag.BackgroundTransparency = 0
weaponTag.BorderColor3 = Color3.fromRGB(75, 85, 99)
weaponTag.BorderSizePixel = 1

local hpBack = Instance.new("Frame")
hpBack.Size = UDim2.fromOffset(312, 30)
hpBack.Position = UDim2.fromOffset(14, 48)
hpBack.BackgroundColor3 = DARK
hpBack.BorderColor3 = Color3.fromRGB(107, 114, 128)
hpBack.BorderSizePixel = 1
hpBack.Parent = playerPanel

local hpFill = Instance.new("Frame")
hpFill.Size = UDim2.fromScale(1, 1)
hpFill.BackgroundColor3 = Color3.fromRGB(220, 38, 38)
hpFill.BorderSizePixel = 0
hpFill.Parent = hpBack

local hpText = Instance.new("TextLabel")
hpText.Size = UDim2.fromScale(1, 1)
hpText.BackgroundTransparency = 1
hpText.Font = HUD_FONT
hpText.TextSize = 18
hpText.TextColor3 = WHITE
hpText.Text = "100 / 100"
hpText.Parent = hpBack

local killsLabel = label(playerPanel, "KILLS 0", UDim2.fromOffset(312, 20), UDim2.fromOffset(14, 88), GRAY, 15)
local stackLabel = label(playerPanel, "", UDim2.fromOffset(312, 20), UDim2.fromOffset(14, 114), GOLD, 15, true)

local abilityPanel = stonePanel("AbilityHud")
abilityPanel.Size = UDim2.fromOffset(206, 118)
abilityPanel.AnchorPoint = Vector2.new(0, 1)
abilityPanel.Position = UDim2.new(0, 16, 1, -16)

local function abilityRow(y: number, keyText: string, keyColor: Color3, name: string)
	local key = label(abilityPanel, keyText, UDim2.fromOffset(44, 14), UDim2.fromOffset(10, y), keyColor, 12, true)
	local nameL = label(abilityPanel, name, UDim2.fromOffset(80, 14), UDim2.fromOffset(50, y), GRAY, 11)
	local state = label(abilityPanel, "READY", UDim2.fromOffset(70, 14), UDim2.fromOffset(126, y), WHITE, 11)
	state.TextXAlignment = Enum.TextXAlignment.Right
	local back = Instance.new("Frame")
	back.Size = UDim2.fromOffset(186, 8)
	back.Position = UDim2.fromOffset(10, y + 16)
	back.BackgroundColor3 = DARK
	back.BorderColor3 = Color3.fromRGB(75, 85, 99)
	back.BorderSizePixel = 1
	back.Parent = abilityPanel
	local fill = Instance.new("Frame")
	fill.Size = UDim2.fromScale(1, 1)
	fill.BorderSizePixel = 0
	fill.Parent = back
	return { key = key, nameL = nameL, state = state, fill = fill }
end

local skillRow = abilityRow(8, "F", GOLD, "SKILL")
local dashRow = abilityRow(44, "SPACE", GOLD, "DASH")
dashRow.fill.BackgroundColor3 = GOLD
local altRow = abilityRow(80, "R", GREEN, "ALT")
altRow.fill.BackgroundColor3 = GREEN

local weaponPanel = stonePanel("WeaponPanel")
weaponPanel.BackgroundTransparency = 0.05
weaponPanel.Size = UDim2.fromOffset(168, 36 + #WeaponConfig.Order * 30)
weaponPanel.AnchorPoint = Vector2.new(1, 0.5)
weaponPanel.Position = UDim2.new(1, -14, 0.5, 0)

local wlist = Instance.new("UIListLayout")
wlist.Padding = UDim.new(0, 5)
wlist.SortOrder = Enum.SortOrder.LayoutOrder
wlist.Parent = weaponPanel

local wpad = Instance.new("UIPadding")
wpad.PaddingTop = UDim.new(0, 8)
wpad.PaddingLeft = UDim.new(0, 8)
wpad.PaddingRight = UDim.new(0, 8)
wpad.PaddingBottom = UDim.new(0, 8)
wpad.Parent = weaponPanel

local wheader = Instance.new("TextLabel")
wheader.LayoutOrder = 0
wheader.Size = UDim2.new(1, 0, 0, 26)
wheader.BackgroundTransparency = 1
wheader.Font = HUD_FONT
wheader.TextSize = 12
wheader.TextColor3 = GRAY
wheader.Text = "WEAPONS"
wheader.Parent = weaponPanel

local lobbyPanel = Instance.new("Frame")
lobbyPanel.Name = "MainLobby"
lobbyPanel.Size = UDim2.fromScale(1, 1)
lobbyPanel.BackgroundColor3 = Color3.fromRGB(8, 9, 13)
lobbyPanel.BackgroundTransparency = 0.05
lobbyPanel.BorderSizePixel = 0
lobbyPanel.ZIndex = 20
lobbyPanel.Parent = screenGui

local lobbyTitle = label(lobbyPanel, "PIXEL ROYALE", UDim2.fromOffset(520, 64), UDim2.new(0.5, -260, 0.32, -32), GOLD, 42, true)
lobbyTitle.TextXAlignment = Enum.TextXAlignment.Center
lobbyTitle.ZIndex = 21

local lobbySubtitle = label(lobbyPanel, "TOPDOWN ROBLOX REMAKE", UDim2.fromOffset(520, 28), UDim2.new(0.5, -260, 0.42, -14), GRAY, 18)
lobbySubtitle.TextXAlignment = Enum.TextXAlignment.Center
lobbySubtitle.ZIndex = 21

local startButton = Instance.new("TextButton")
startButton.Name = "StartButton"
startButton.Size = UDim2.fromOffset(260, 64)
startButton.Position = UDim2.new(0.5, -130, 0.52, -32)
startButton.BackgroundColor3 = STONE
startButton.BorderColor3 = GOLD
startButton.BorderSizePixel = 3
startButton.Font = HUD_FONT
startButton.TextSize = 24
startButton.TextColor3 = GOLD
startButton.Text = "START"
startButton.ZIndex = 21
startButton.Parent = lobbyPanel

local function setGameplayVisible(visible: boolean)
	playerPanel.Visible = visible
	abilityPanel.Visible = visible
	weaponPanel.Visible = visible
end

setGameplayVisible(false)

startButton.MouseButton1Click:Connect(function()
	inGame = true
	lobbyPanel.Visible = false
	setGameplayVisible(true)
	CombatRemote:FireServer("EnterGame")
end)

local weaponButtons: { [string]: TextButton } = {}

local function getHumanoid()
	local character = player.Character
	return character and character:FindFirstChildOfClass("Humanoid")
end

local function getRoot()
	local character = player.Character
	return character and character:FindFirstChild("HumanoidRootPart")
end

local function rootOfUser(userId: number?): BasePart?
	local other = userId and Players:GetPlayerByUserId(userId)
	local char = other and other.Character
	return char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
end

local function updateWeaponButtons()
	for weaponId, button in pairs(weaponButtons) do
		local active = weaponId == selectedWeapon
		button.BackgroundColor3 = if active then Color3.fromRGB(40, 32, 20) else Color3.fromRGB(20, 17, 26)
		button.BorderColor3 = if active then GOLD else Color3.fromRGB(64, 64, 74)
		button.TextColor3 = if active then GOLD else WeaponConfig.getWeapon(weaponId).color
	end
end

local function setWeapon(weaponId: string)
	local weapon = WeaponConfig.getWeapon(weaponId)
	selectedWeapon = weaponId
	weaponTag.Text = string.upper(weapon.displayName)
	skillRow.nameL.Text = skillLabelFor(weaponId)
	skillRow.fill.BackgroundColor3 = weapon.color
	skillCooldown = skillCooldownFor(weaponId)
	altCooldown = altCooldownFor(weaponId)

	local hasAlt = altCooldown > 0
	altRow.key.TextTransparency = if hasAlt then 0 else 0.6
	altRow.nameL.Text = if hasAlt then altLabelFor(weaponId) else "NONE"
	altRow.nameL.TextTransparency = if hasAlt then 0 else 0.5
	altRow.state.TextTransparency = if hasAlt then 0 else 0.5
	altRow.fill.BackgroundTransparency = if hasAlt then 0 else 0.7

	chargingGreatsword = false
	chargingKatana = false
	qteState = nil
	EffectsClient.clearQTE()
	EffectsClient.clearChargePreview()
	updateWeaponButtons()
	CombatRemote:FireServer("SetWeapon", weaponId)
end

for index, weaponId in ipairs(WeaponConfig.Order) do
	local weapon = WeaponConfig.getWeapon(weaponId)
	local button = Instance.new("TextButton")
	button.Name = weaponId
	button.LayoutOrder = index
	button.Size = UDim2.new(1, 0, 0, 25)
	button.BackgroundColor3 = Color3.fromRGB(20, 17, 26)
	button.BorderColor3 = Color3.fromRGB(64, 64, 74)
	button.BorderSizePixel = 1
	button.Font = HUD_FONT
	button.TextSize = 12
	button.TextColor3 = weapon.color
	button.TextXAlignment = Enum.TextXAlignment.Left
	button.Text = "  " .. weapon.displayName
	button.Parent = weaponPanel
	button.MouseButton1Click:Connect(function()
		setWeapon(weaponId)
	end)
	weaponButtons[weaponId] = button
end

local function getKills(): number
	local ls = player:FindFirstChild("leaderstats")
	local k = ls and ls:FindFirstChild("Kills")
	return (k and k:IsA("IntValue")) and k.Value or 0
end

local function updateHud()
	local humanoid = getHumanoid()
	if humanoid then
		local maxHealth = math.max(humanoid.MaxHealth, 1)
		hpFill.Size = UDim2.fromScale(math.clamp(humanoid.Health / maxHealth, 0, 1), 1)
		hpText.Text = string.format("%d / %d", math.ceil(humanoid.Health), math.ceil(maxHealth))
	end

	nameLabel.Text = player.DisplayName
	killsLabel.Text = "KILLS " .. tostring(getKills())

	local bowStacks = player:GetAttribute("BowStacks") or 0
	if selectedWeapon == "bow" then
		stackLabel.Text = string.format("[%d / %d STACK]", bowStacks, WeaponConfig.Skill.bow.maxStacks)
	else
		stackLabel.Text = ""
	end

	local now = os.clock()
	local function setBar(row, readyAt: number, cooldown: number)
		if cooldown <= 0 or now >= readyAt then
			row.fill.Size = UDim2.fromScale(1, 1)
			row.state.Text = "READY"
		else
			row.fill.Size = UDim2.fromScale(math.clamp(1 - (readyAt - now) / cooldown, 0, 1), 1)
			row.state.Text = string.format("%.1f", readyAt - now)
		end
	end

	setBar(skillRow, skillReadyAt, skillCooldown)
	if chargingGreatsword then
		local sk = WeaponConfig.Skill.greatsword
		local ratio = math.clamp((now - greatswordChargeStart) / sk.chargeMax, 0, 1)
		skillRow.fill.Size = UDim2.fromScale(ratio, 1)
		skillRow.state.Text = string.format("%d%%", math.floor(ratio * 100 + 0.5))
	end
	setBar(dashRow, dashReadyAt, Dash.cooldown)
	if altCooldown > 0 then
		setBar(altRow, altReadyAt, altCooldown)
	end
	if chargingKatana then
		local sk = WeaponConfig.Skill.katana
		local ratio = math.clamp((now - katanaChargeStart) / sk.iaijutsuCharge, 0, 1)
		altRow.fill.Size = UDim2.fromScale(ratio, 1)
		altRow.state.Text = string.format("%d%%", math.floor(ratio * 100 + 0.5))
	end
end

local function bindCharacter(character: Model)
	local humanoid = character:WaitForChild("Humanoid", 10)
	if humanoid then
		humanoid.AutoRotate = false
		humanoid.JumpPower = 0
		humanoid.JumpHeight = 0
		humanoid:SetStateEnabled(Enum.HumanoidStateType.Jumping, false)
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
		return aimDirection, aimPoint
	end
	local t = (AIM_PLANE_Y - ray.Origin.Y) / ray.Direction.Y
	if t <= 0 then
		return aimDirection, aimPoint
	end
	local rawHit = ray.Origin + ray.Direction * t
	local hit = Vector3.new(
		math.clamp(rawHit.X, -ARENA_HALF_SIZE, ARENA_HALF_SIZE),
		AIM_PLANE_Y,
		math.clamp(rawHit.Z, -ARENA_HALF_SIZE, ARENA_HALF_SIZE)
	)
	local flat = Vector3.new(hit.X - root.Position.X, 0, hit.Z - root.Position.Z)
	if flat.Magnitude <= 0.01 then
		return aimDirection, hit
	end
	return flat.Unit, hit
end

local function getMoveDirection(): Vector3
	local move = Vector3.new(0, 0, 0)
	for keyCode, direction in pairs(MOVE_KEYS) do
		if heldMoveKeys[keyCode] then
			move += direction
		end
	end
	if move.Magnitude > 1 then
		return move.Unit
	end
	return move
end

local function clampRootToArena(root: BasePart)
	local position = root.Position
	local clampedX = math.clamp(position.X, -ARENA_HALF_SIZE, ARENA_HALF_SIZE)
	local clampedZ = math.clamp(position.Z, -ARENA_HALF_SIZE, ARENA_HALF_SIZE)
	if math.abs(position.X - clampedX) > 0.05 or math.abs(position.Z - clampedZ) > 0.05 then
		root.CFrame = CFrame.new(clampedX, position.Y, clampedZ)
	end
end

local function attack()
	if not inGame or NO_BASIC_ATTACK[selectedWeapon] then
		return
	end
	CombatRemote:FireServer("Attack", { target = aimPoint })
end

local function tryDash()
	if not inGame or not getRoot() then
		return
	end
	local now = os.clock()
	if now < dashReadyAt then
		return
	end
	local move = getMoveDirection()
	local dir = if move.Magnitude > 0.05 then move else aimDirection
	local flat = Vector3.new(dir.X, 0, dir.Z)
	if flat.Magnitude <= 0.001 then
		flat = aimDirection
	end
	dashDir = flat.Unit
	dashUntil = now + Dash.duration
	dashReadyAt = now + Dash.cooldown
	CombatRemote:FireServer("Dash")
end

local function pressSkill()
	if not inGame then
		return
	end
	if qteState then
		CombatRemote:FireServer("DaggerQTE")
		qteState = nil
		EffectsClient.clearQTE()
		return
	end

	local now = os.clock()
	if selectedWeapon == "greatsword" then
		if now < skillReadyAt or chargingGreatsword then
			return
		end
		chargingGreatsword = true
		greatswordChargeStart = now
		CombatRemote:FireServer("SkillStart")
		return
	end

	if selectedWeapon == "bow" and (player:GetAttribute("BowStacks") or 0) <= 0 then
		return
	end

	if now >= skillReadyAt then
		skillReadyAt = now + skillCooldown
	end
	CombatRemote:FireServer("Skill")
end

local function releaseSkill()
	if not inGame or selectedWeapon ~= "greatsword" or not chargingGreatsword then
		return
	end
	chargingGreatsword = false
	skillReadyAt = os.clock() + skillCooldown
	CombatRemote:FireServer("SkillRelease")
	EffectsClient.clearChargePreview()
end

local function handleMoveAction(_, inputState, inputObject)
	if not inputObject then
		return Enum.ContextActionResult.Sink
	end
	if inputState == Enum.UserInputState.Begin then
		heldMoveKeys[inputObject.KeyCode] = true
	elseif inputState == Enum.UserInputState.End then
		heldMoveKeys[inputObject.KeyCode] = nil
	end
	return Enum.ContextActionResult.Sink
end

ContextActionService:BindActionAtPriority(
	"PixelRoyaleMove", handleMoveAction, false, 3000,
	Enum.KeyCode.W, Enum.KeyCode.A, Enum.KeyCode.S, Enum.KeyCode.D,
	Enum.KeyCode.Up, Enum.KeyCode.Left, Enum.KeyCode.Down, Enum.KeyCode.Right
)

ContextActionService:BindActionAtPriority("PixelRoyaleDash", function(_, inputState)
	if inputState == Enum.UserInputState.Begin then
		tryDash()
	end
	return Enum.ContextActionResult.Sink
end, false, 3000, Enum.KeyCode.Space)

ContextActionService:BindActionAtPriority("PixelRoyaleSkill", function(_, inputState)
	if inputState == Enum.UserInputState.Begin then
		pressSkill()
	elseif inputState == Enum.UserInputState.End then
		releaseSkill()
	end
	return Enum.ContextActionResult.Sink
end, false, 3000, Enum.KeyCode.F)

ContextActionService:BindActionAtPriority("PixelRoyaleAltSkill", function(_, inputState)
	if not inGame then
		return Enum.ContextActionResult.Sink
	end
	if inputState == Enum.UserInputState.Begin then
		local now = os.clock()
		if altCooldown > 0 and now < altReadyAt then
			return Enum.ContextActionResult.Sink
		end
		if selectedWeapon == "katana" then
			if chargingKatana then
				return Enum.ContextActionResult.Sink
			end
			chargingKatana = true
			katanaChargeStart = now
			CombatRemote:FireServer("AltStart")
		else
			if altCooldown > 0 then
				altReadyAt = now + altCooldown
			end
			CombatRemote:FireServer("AltSkill")
		end
	elseif inputState == Enum.UserInputState.End and selectedWeapon == "katana" and chargingKatana then
		chargingKatana = false
		if altCooldown > 0 then
			altReadyAt = os.clock() + altCooldown
		end
		CombatRemote:FireServer("AltRelease")
		EffectsClient.clearChargePreview()
	end
	return Enum.ContextActionResult.Sink
end, false, 3000, Enum.KeyCode.R)

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
	elseif action == "SkillEffect" and typeof(payload) == "table" then
		if payload.kind == "sweep" then
			EffectsClient.drawAttackEffect(payload)
		elseif payload.kind == "buff" then
			local root = rootOfUser(payload.userId)
			if root then
				EffectsClient.drawBuff(root, payload.color, payload.duration)
			end
		end
	elseif action == "Telegraph" and typeof(payload) == "table" then
		EffectsClient.drawTelegraph(payload)
	elseif action == "QTEStart" and typeof(payload) == "table" then
		qteState = {
			targetUserId = payload.targetUserId,
			startedAt = os.clock(),
			lock = payload.lock or 0.7,
			window = payload.window or 0.9,
			perfect = payload.perfect or 0.56,
			tolerance = payload.tolerance or 0.15,
		}
	elseif action == "QTEEnd" then
		qteState = nil
		EffectsClient.clearQTE()
	elseif action == "DashEffect" and typeof(payload) == "table" then
		local root = rootOfUser(payload.userId)
		if root then
			EffectsClient.drawDash(root.Position)
		end
	elseif action == "Projectile" and typeof(payload) == "table" then
		EffectsClient.drawProjectile(payload)
	elseif action == "Spark" and typeof(payload) == "table" then
		EffectsClient.drawHitSpark(payload.pos, payload.color)
	end
end)

setWeapon(selectedWeapon)

RunService.RenderStepped:Connect(function(dt)
	local root = getRoot()
	if not root then
		return
	end

	camera.CameraType = Enum.CameraType.Scriptable
	camera.FieldOfView = 50
	camera.CFrame = CFrame.lookAt(CAMERA_POSITION, CAMERA_TARGET, CAMERA_UP)

	aimDirection, aimPoint = computeAim(root)

	local humanoid = getHumanoid()
	if not inGame then
		UserInputService.MouseIconEnabled = true
		if humanoid then
			humanoid.AutoRotate = false
			humanoid:Move(Vector3.zero, false)
		end
		EffectsClient.clearPreview()
		EffectsClient.clearChargePreview()
		EffectsClient.clearAimCrosshair()
		EffectsClient.clearQTE()
		CombatantTokenClient.updateAll(aimDirection)
		updateHud()
		return
	end

	UserInputService.MouseIconEnabled = false
	if humanoid then
		humanoid.AutoRotate = false
		if os.clock() < dashUntil then
			humanoid:Move(Vector3.zero, false)
			root.CFrame = root.CFrame + dashDir * (Dash.speed * dt)
		else
			humanoid:Move(getMoveDirection(), false)
		end
	end

	clampRootToArena(root)
	CombatantTokenClient.updateAll(aimDirection)

	local weapon = WeaponConfig.getEffectiveWeapon(selectedWeapon, nil)
	EffectsClient.updateAimCrosshair(aimPoint, weapon.color)
	if not NO_BASIC_ATTACK[selectedWeapon] and not chargingKatana then
		EffectsClient.updateAttackPreview(root.Position, aimDirection, weapon, aimPoint)
	else
		EffectsClient.clearPreview()
	end

	if chargingGreatsword then
		local sk = WeaponConfig.Skill.greatsword
		local chargeRatio = math.clamp((os.clock() - greatswordChargeStart) / sk.chargeMax, 0, 1)
		EffectsClient.updateChargePreview(root.Position, aimDirection, sk, chargeRatio, WeaponConfig.getWeapon("greatsword").color)
	elseif chargingKatana then
		local sk = WeaponConfig.Skill.katana
		local chargeRatio = math.clamp((os.clock() - katanaChargeStart) / sk.iaijutsuCharge, 0, 1)
		EffectsClient.updateChargePreview(root.Position, aimDirection, {
			hitType = "line",
			range = sk.iaijutsuRange,
			width = sk.iaijutsuWidth,
		}, chargeRatio, WeaponConfig.getWeapon("katana").color)
	else
		EffectsClient.clearChargePreview()
	end

	if qteState then
		local targetRoot = rootOfUser(qteState.targetUserId)
		local elapsed = os.clock() - qteState.startedAt
		if not targetRoot or elapsed > qteState.lock + qteState.window then
			qteState = nil
			EffectsClient.clearQTE()
		else
			EffectsClient.updateDaggerQTE(root.Position, targetRoot.Position, qteState, elapsed)
		end
	end

	local now = os.clock()
	if now - lastAimSent >= 0.05 then
		lastAimSent = now
		CombatRemote:FireServer("SetAim", aimDirection)
	end

	updateHud()
end)
