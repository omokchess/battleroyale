local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local PixelRoyale = ReplicatedStorage:WaitForChild("PixelRoyale")
local WeaponConfig = require(PixelRoyale:WaitForChild("WeaponConfig"))
local HitboxUtil = require(PixelRoyale:WaitForChild("HitboxUtil"))
local Dash = WeaponConfig.Dash

local Remotes = PixelRoyale:FindFirstChild("Remotes")
if not Remotes then
	Remotes = Instance.new("Folder")
	Remotes.Name = "Remotes"
	Remotes.Parent = PixelRoyale
end

local CombatRemote = Remotes:FindFirstChild("Combat")
if not CombatRemote then
	CombatRemote = Instance.new("RemoteEvent")
	CombatRemote.Name = "Combat"
	CombatRemote.Parent = Remotes
end

type PlayerState = {
	weaponId: string,
	aimDirection: Vector3,
	lastAttack: number,
	attackCooldown: number,
	comboStep: number,
	comboExpire: number,
	lastDash: number,
	invulnUntil: number,
}

local states: { [Player]: PlayerState } = {}

local function hideAvatar(character: Model, humanoid: Humanoid?)
	if humanoid then
		humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	end

	for _, descendant in ipairs(character:GetDescendants()) do
		if descendant:IsA("BasePart") then
			descendant.Transparency = 1
			descendant.CastShadow = false
		elseif descendant:IsA("Decal") then
			descendant.Transparency = 1
		end
	end
end

local function ensureArena()
	if workspace:FindFirstChild("PixelRoyaleArena") then
		return
	end

	local baseplate = workspace:FindFirstChild("Baseplate")
	if baseplate and baseplate:IsA("BasePart") then
		baseplate.Transparency = 1
		baseplate.CanCollide = false
		baseplate.CanQuery = false
	end

	local arena = Instance.new("Folder")
	arena.Name = "PixelRoyaleArena"
	arena.Parent = workspace

	local function staticPart(name: string, size: Vector3, position: Vector3, color: Color3, material, transparency: number, canCollide: boolean)
		local part = Instance.new("Part")
		part.Name = name
		part.Anchored = true
		part.Size = size
		part.Position = position
		part.Color = color
		part.Material = material
		part.Transparency = transparency
		part.CanCollide = canCollide
		part.CanQuery = canCollide
		part.CastShadow = false
		part.Parent = arena
		return part
	end

	local floor = Instance.new("Part")
	floor.Name = "ArenaFloor"
	floor.Anchored = true
	floor.Size = Vector3.new(140, 1, 140)
	floor.Position = Vector3.new(0, -0.45, 0)
	floor.Color = Color3.fromRGB(18, 24, 33)
	floor.Material = Enum.Material.SmoothPlastic
	floor.CastShadow = false
	floor.Parent = arena

	for offset = -63, 63, 7 do
		staticPart("GridX_" .. tostring(offset), Vector3.new(140, 0.08, 0.08), Vector3.new(0, 0.09, offset), Color3.fromRGB(45, 68, 82), Enum.Material.Neon, 0.68, false)
		staticPart("GridZ_" .. tostring(offset), Vector3.new(0.08, 0.08, 140), Vector3.new(offset, 0.1, 0), Color3.fromRGB(45, 68, 82), Enum.Material.Neon, 0.68, false)
	end

	staticPart("NorthWall", Vector3.new(142, 8, 2), Vector3.new(0, 3.5, -71), Color3.fromRGB(31, 245, 255), Enum.Material.SmoothPlastic, 1, true)
	staticPart("SouthWall", Vector3.new(142, 8, 2), Vector3.new(0, 3.5, 71), Color3.fromRGB(31, 245, 255), Enum.Material.SmoothPlastic, 1, true)
	staticPart("EastWall", Vector3.new(2, 8, 142), Vector3.new(71, 3.5, 0), Color3.fromRGB(31, 245, 255), Enum.Material.SmoothPlastic, 1, true)
	staticPart("WestWall", Vector3.new(2, 8, 142), Vector3.new(-71, 3.5, 0), Color3.fromRGB(31, 245, 255), Enum.Material.SmoothPlastic, 1, true)

	staticPart("NorthNeonEdge", Vector3.new(142, 0.25, 0.45), Vector3.new(0, 0.3, -70), Color3.fromRGB(31, 245, 255), Enum.Material.Neon, 0.05, false)
	staticPart("SouthNeonEdge", Vector3.new(142, 0.25, 0.45), Vector3.new(0, 0.3, 70), Color3.fromRGB(31, 245, 255), Enum.Material.Neon, 0.05, false)
	staticPart("EastNeonEdge", Vector3.new(0.45, 0.25, 142), Vector3.new(70, 0.3, 0), Color3.fromRGB(31, 245, 255), Enum.Material.Neon, 0.05, false)
	staticPart("WestNeonEdge", Vector3.new(0.45, 0.25, 142), Vector3.new(-70, 0.3, 0), Color3.fromRGB(31, 245, 255), Enum.Material.Neon, 0.05, false)
end

local function getState(player: Player): PlayerState
	local state = states[player]
	if state then
		return state
	end

	state = {
		weaponId = WeaponConfig.DefaultWeapon,
		aimDirection = Vector3.new(0, 0, -1),
		lastAttack = 0,
		attackCooldown = 0,
		comboStep = 0,
		comboExpire = 0,
		lastDash = 0,
		invulnUntil = 0,
	}
	states[player] = state
	player:SetAttribute("Weapon", state.weaponId)
	player:SetAttribute("AimX", state.aimDirection.X)
	player:SetAttribute("AimZ", state.aimDirection.Z)
	return state
end

local function getCharacterParts(player: Player)
	local character = player.Character
	if not character then
		return nil, nil, nil
	end

	local humanoid = character:FindFirstChildOfClass("Humanoid")
	local root = character:FindFirstChild("HumanoidRootPart")
	if not humanoid or not root or humanoid.Health <= 0 then
		return nil, nil, nil
	end

	return character, humanoid, root
end

local function applyWeaponStats(player: Player)
	local state = getState(player)
	local weapon = WeaponConfig.getWeapon(state.weaponId)
	local _, humanoid = getCharacterParts(player)
	if not humanoid then
		return
	end

	humanoid.MaxHealth = weapon.maxHealth
	humanoid.Health = math.min(humanoid.Health, humanoid.MaxHealth)
	if humanoid.Health <= 0 then
		humanoid.Health = humanoid.MaxHealth
	end
	humanoid.WalkSpeed = WeaponConfig.BaseWalkSpeed * weapon.moveSpeed
	humanoid.JumpPower = 0
	player:SetAttribute("Weapon", state.weaponId)
	player:SetAttribute("WeaponName", weapon.displayName)
	player:SetAttribute("MaxHealth", weapon.maxHealth)

end

local function setupLeaderstats(player: Player)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	leaderstats.Parent = player

	local kills = Instance.new("IntValue")
	kills.Name = "Kills"
	kills.Value = 0
	kills.Parent = leaderstats
end

local function spawnNearArena(player: Player, character: Model)
	local root = character:WaitForChild("HumanoidRootPart", 10)
	if not root then
		return
	end

	local angle = math.random() * math.pi * 2
	local radius = math.random(0, 34)
	root.CFrame = CFrame.new(math.cos(angle) * radius, 4, math.sin(angle) * radius)
end

local function damageVictim(attacker: Player, victimHumanoid: Humanoid, amount: number)
	local before = victimHumanoid.Health
	victimHumanoid:TakeDamage(amount)

	if before > 0 and victimHumanoid.Health <= 0 then
		local leaderstats = attacker:FindFirstChild("leaderstats")
		local kills = leaderstats and leaderstats:FindFirstChild("Kills")
		if kills and kills:IsA("IntValue") then
			kills.Value += 1
		end
	end
end

local function withFinisher(base, finisher)
	local swing = table.clone(base)
	for key, value in pairs(finisher) do
		swing[key] = value
	end
	return swing
end

local function attack(player: Player)
	local state = getState(player)
	local weapon = WeaponConfig.getWeapon(state.weaponId)
	local _, humanoid, root = getCharacterParts(player)
	if not humanoid or not root then
		return
	end

	local now = os.clock()
	if now - state.lastAttack < state.attackCooldown then
		return
	end

	-- Combo: every `cycle`-th swing becomes the finisher (own shape/damage/cooldown).
	local combo = WeaponConfig.Combo[state.weaponId]
	local swing = weapon
	local isFinisher = false
	if combo then
		if now > state.comboExpire then
			state.comboStep = 0
		end
		state.comboStep += 1
		if state.comboStep >= combo.cycle then
			state.comboStep = 0
			isFinisher = true
			swing = withFinisher(weapon, combo.finisher)
		end
		state.comboExpire = now + combo.comboReset
	end

	state.lastAttack = now
	state.attackCooldown = swing.cooldown or weapon.cooldown

	local origin = root.Position
	local direction = HitboxUtil.safeUnit(state.aimDirection, HitboxUtil.safeUnit(root.CFrame.LookVector))
	local hitCount = 0

	for _, other in ipairs(Players:GetPlayers()) do
		if other ~= player then
			local otherState = states[other]
			if otherState and now < otherState.invulnUntil then
				continue -- dodging (dash i-frames)
			end
			local _, otherHumanoid, otherRoot = getCharacterParts(other)
			if otherHumanoid and otherRoot and HitboxUtil.check(origin, direction, otherRoot.Position, swing) then
				hitCount += 1
				damageVictim(player, otherHumanoid, swing.damage)
			end
		end
	end

	CombatRemote:FireAllClients("AttackEffect", {
		userId = player.UserId,
		weaponId = state.weaponId,
		hitType = swing.hitType,
		origin = origin,
		direction = direction,
		range = swing.range,
		width = swing.width or 1,
		angle = swing.angle or 0,
		color = weapon.color,
		hitCount = hitCount,
		isFinisher = isFinisher,
	})
end

CombatRemote.OnServerEvent:Connect(function(player: Player, action: string, payload)
	local state = getState(player)

	if action == "SetAim" and typeof(payload) == "Vector3" then
		state.aimDirection = HitboxUtil.safeUnit(payload, state.aimDirection)
		player:SetAttribute("AimX", state.aimDirection.X)
		player:SetAttribute("AimZ", state.aimDirection.Z)
	elseif action == "SetWeapon" and typeof(payload) == "string" and WeaponConfig.Weapons[payload] then
		state.weaponId = payload
		state.lastAttack = 0
		state.attackCooldown = 0
		state.comboStep = 0
		applyWeaponStats(player)
	elseif action == "Attack" then
		attack(player)
	elseif action == "Dash" then
		local now = os.clock()
		if now - state.lastDash >= Dash.cooldown then
			state.lastDash = now
			state.invulnUntil = now + Dash.iframe
			CombatRemote:FireAllClients("DashEffect", {
				userId = player.UserId,
				iframe = Dash.iframe,
			})
		end
	end
end)

ensureArena()

Players.PlayerAdded:Connect(function(player: Player)
	getState(player)
	setupLeaderstats(player)

	player.CharacterAdded:Connect(function(character)
		spawnNearArena(player, character)
		task.defer(function()
			local _, humanoid, root = getCharacterParts(player)
			if humanoid and root then
				hideAvatar(character, humanoid)
			end
			applyWeaponStats(player)
		end)
	end)
end)

Players.PlayerRemoving:Connect(function(player: Player)
	states[player] = nil
end)

for _, player in ipairs(Players:GetPlayers()) do
	getState(player)
	if not player:FindFirstChild("leaderstats") then
		setupLeaderstats(player)
	end
end
