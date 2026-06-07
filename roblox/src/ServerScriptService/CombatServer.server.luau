local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local PixelRoyale = ReplicatedStorage:WaitForChild("PixelRoyale")
local WeaponConfig = require(PixelRoyale:WaitForChild("WeaponConfig"))
local HitboxUtil = require(PixelRoyale:WaitForChild("HitboxUtil"))

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
}

local states: { [Player]: PlayerState } = {}

local function ensureArena()
	if workspace:FindFirstChild("PixelRoyaleArena") then
		return
	end

	local arena = Instance.new("Folder")
	arena.Name = "PixelRoyaleArena"
	arena.Parent = workspace

	local floor = Instance.new("Part")
	floor.Name = "ArenaFloor"
	floor.Anchored = true
	floor.Size = Vector3.new(140, 1, 140)
	floor.Position = Vector3.new(0, -0.5, 0)
	floor.Color = Color3.fromRGB(22, 28, 36)
	floor.Material = Enum.Material.SmoothPlastic
	floor.Parent = arena

	local function wall(name: string, size: Vector3, position: Vector3)
		local part = Instance.new("Part")
		part.Name = name
		part.Anchored = true
		part.Size = size
		part.Position = position
		part.Color = Color3.fromRGB(31, 245, 255)
		part.Material = Enum.Material.Neon
		part.Transparency = 0.2
		part.Parent = arena
	end

	wall("NorthWall", Vector3.new(142, 5, 2), Vector3.new(0, 2, -71))
	wall("SouthWall", Vector3.new(142, 5, 2), Vector3.new(0, 2, 71))
	wall("EastWall", Vector3.new(2, 5, 142), Vector3.new(71, 2, 0))
	wall("WestWall", Vector3.new(2, 5, 142), Vector3.new(-71, 2, 0))
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
	}
	states[player] = state
	player:SetAttribute("Weapon", state.weaponId)
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

local function attack(player: Player)
	local state = getState(player)
	local weapon = WeaponConfig.getWeapon(state.weaponId)
	local _, humanoid, root = getCharacterParts(player)
	if not humanoid or not root then
		return
	end

	local now = os.clock()
	if now - state.lastAttack < weapon.cooldown then
		return
	end
	state.lastAttack = now

	local origin = root.Position
	local direction = HitboxUtil.safeUnit(state.aimDirection, HitboxUtil.safeUnit(root.CFrame.LookVector))
	local hitCount = 0

	for _, other in ipairs(Players:GetPlayers()) do
		if other ~= player then
			local _, otherHumanoid, otherRoot = getCharacterParts(other)
			if otherHumanoid and otherRoot and HitboxUtil.check(origin, direction, otherRoot.Position, weapon) then
				hitCount += 1
				damageVictim(player, otherHumanoid, weapon.damage)
			end
		end
	end

	CombatRemote:FireAllClients("AttackEffect", {
		userId = player.UserId,
		weaponId = state.weaponId,
		hitType = weapon.hitType,
		origin = origin,
		direction = direction,
		range = weapon.range,
		width = weapon.width or 1,
		angle = weapon.angle or 0,
		color = weapon.color,
		hitCount = hitCount,
	})
end

CombatRemote.OnServerEvent:Connect(function(player: Player, action: string, payload)
	local state = getState(player)

	if action == "SetAim" and typeof(payload) == "Vector3" then
		state.aimDirection = HitboxUtil.safeUnit(payload, state.aimDirection)
	elseif action == "SetWeapon" and typeof(payload) == "string" and WeaponConfig.Weapons[payload] then
		state.weaponId = payload
		state.lastAttack = 0
		applyWeaponStats(player)
	elseif action == "Attack" then
		attack(player)
	end
end)

ensureArena()

Players.PlayerAdded:Connect(function(player: Player)
	getState(player)
	setupLeaderstats(player)

	player.CharacterAdded:Connect(function(character)
		spawnNearArena(player, character)
		task.defer(function()
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

