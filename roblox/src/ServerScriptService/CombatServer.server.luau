local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local PixelRoyale = ReplicatedStorage:WaitForChild("PixelRoyale")
local WeaponConfig = require(PixelRoyale:WaitForChild("WeaponConfig"))
local HitboxUtil = require(PixelRoyale:WaitForChild("HitboxUtil"))
local RunService = game:GetService("RunService")
local Dash = WeaponConfig.Dash

-- F-skill buffs that change the basic attack while active (resolved by getEffectiveWeapon).
local BUFF_BY_WEAPON = { axe = "axe_rage", gauntlet = "gauntlet_lance", rapier = "rapier_riposte" }

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
	buffType: string?,
	buffExpire: number,
	skillReadyAt: number,
	altReadyAt: number,
}

local states: { [Player]: PlayerState } = {}
local projectiles = {} -- live server-simulated projectiles (waves, fireballs, …)
local PROJ_TARGET_RADIUS = 2 -- studs; combatant body half-size for projectile contact

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
		buffType = nil,
		buffExpire = 0,
		skillReadyAt = 0,
		altReadyAt = 0,
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
	-- Axe rage roots the wielder in place while active.
	local moveSpeed = if state.buffType == "axe_rage" then 0 else weapon.moveSpeed
	humanoid.WalkSpeed = WeaponConfig.BaseWalkSpeed * moveSpeed
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
	-- While an F-skill buff is up (axe rage / gauntlet lance / rapier riposte),
	-- the basic attack uses the buffed stats and does not combo.
	local weapon = WeaponConfig.getEffectiveWeapon(state.weaponId, state.buffType)
	local _, humanoid, root = getCharacterParts(player)
	if not humanoid or not root then
		return
	end

	local now = os.clock()
	if now - state.lastAttack < state.attackCooldown then
		return
	end

	-- Combo: every `cycle`-th swing becomes the finisher (own shape/damage/cooldown).
	local combo = if state.buffType then nil else WeaponConfig.Combo[state.weaponId]
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
	local hitPoints = {}

	for _, other in ipairs(Players:GetPlayers()) do
		if other ~= player then
			local otherState = states[other]
			if otherState and now < otherState.invulnUntil then
				continue -- dodging (dash i-frames)
			end
			local _, otherHumanoid, otherRoot = getCharacterParts(other)
			if otherHumanoid and otherRoot and HitboxUtil.check(origin, direction, otherRoot.Position, swing) then
				hitCount += 1
				table.insert(hitPoints, otherRoot.Position)
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
		hits = hitPoints,
		isFinisher = isFinisher,
	})
end

-- Spawn a server-simulated projectile + tell clients to render it flying.
local function spawnProjectile(owner: Player, origin: Vector3, direction: Vector3, opts)
	table.insert(projectiles, {
		owner = owner,
		pos = origin,
		dir = direction,
		speed = opts.speed,
		remaining = opts.range,
		damage = opts.damage,
		radius = opts.radius or 0.6,
		pierce = opts.pierce or false,
		color = opts.color,
		hitSet = {},
	})
	CombatRemote:FireAllClients("Projectile", {
		origin = origin,
		direction = direction,
		speed = opts.speed,
		range = opts.range,
		radius = opts.radius or 0.6,
		color = opts.color,
	})
end

local function clearBuff(player: Player, state: PlayerState)
	if state.buffType then
		state.buffType = nil
		applyWeaponStats(player)
	end
end

local function performSkill(player: Player)
	local state = getState(player)
	local sk = WeaponConfig.Skill[state.weaponId]
	if not sk then
		return
	end
	local now = os.clock()
	if now < state.skillReadyAt then
		return
	end
	local _, humanoid, root = getCharacterParts(player)
	if not humanoid or not root then
		return
	end

	-- Buff skills (axe rage / gauntlet lance / rapier riposte): enable the buff;
	-- its cooldown starts AFTER the buff ends.
	local buff = BUFF_BY_WEAPON[state.weaponId]
	if buff then
		state.buffType = buff
		state.buffExpire = now + sk.buff
		state.skillReadyAt = now + sk.buff + sk.cooldown
		applyWeaponStats(player)
		CombatRemote:FireAllClients("SkillEffect", {
			userId = player.UserId,
			weaponId = state.weaponId,
			kind = "buff",
			buff = buff,
			duration = sk.buff,
			color = WeaponConfig.getWeapon(state.weaponId).color,
		})
		return
	end

	-- Scythe F: one instant wide harvest sweep (outer edge hits harder).
	if state.weaponId == "scythe" then
		state.skillReadyAt = now + sk.cooldown
		local origin = root.Position
		local direction = HitboxUtil.safeUnit(state.aimDirection, HitboxUtil.safeUnit(root.CFrame.LookVector))
		local shape = { hitType = sk.hitType, range = sk.range, angle = sk.angle }
		local hitCount = 0
		local hitPoints = {}
		for _, other in ipairs(Players:GetPlayers()) do
			if other ~= player then
				local otherState = states[other]
				if otherState and now < otherState.invulnUntil then
					continue
				end
				local _, otherHumanoid, otherRoot = getCharacterParts(other)
				if otherHumanoid and otherRoot and HitboxUtil.check(origin, direction, otherRoot.Position, shape) then
					local dist = HitboxUtil.flat(otherRoot.Position - origin).Magnitude
					local dmg = if dist > (sk.innerRange or 0) then sk.sweetDamage else sk.damage
					hitCount += 1
					table.insert(hitPoints, otherRoot.Position)
					damageVictim(player, otherHumanoid, dmg)
				end
			end
		end
		CombatRemote:FireAllClients("SkillEffect", {
			userId = player.UserId,
			weaponId = state.weaponId,
			kind = "sweep",
			hitType = sk.hitType,
			origin = origin,
			direction = direction,
			range = sk.range,
			angle = sk.angle or 0,
			color = WeaponConfig.getWeapon(state.weaponId).color,
			hitCount = hitCount,
			hits = hitPoints,
		})
		return
	end

	-- Sword F: fire `waveCount` energy waves (projectiles) along the aim.
	if state.weaponId == "sword" then
		state.skillReadyAt = now + sk.cooldown
		local direction = HitboxUtil.safeUnit(state.aimDirection, HitboxUtil.safeUnit(root.CFrame.LookVector))
		for i = 1, sk.waveCount do
			task.delay((i - 1) * sk.waveInterval, function()
				local _, hum, rt = getCharacterParts(player)
				if rt and hum then
					spawnProjectile(player, rt.Position, direction, {
						speed = sk.waveSpeed,
						range = WeaponConfig.REACH,
						damage = sk.directDamage,
						radius = 0.9,
						color = WeaponConfig.getWeapon("sword").color,
					})
				end
			end)
		end
		return
	end

	-- Hammer F: three expanding shockwaves at the cast spot after a telegraph.
	if state.weaponId == "hammer" then
		state.skillReadyAt = now + sk.cooldown
		local castPos = root.Position
		local t = sk.preview
		for idx, wave in ipairs(sk.waves) do
			t += sk.waveDelays[idx]
			local w = wave
			task.delay(t, function()
				local tnow = os.clock()
				for _, other in ipairs(Players:GetPlayers()) do
					if other ~= player then
						local otherState = states[other]
						if not (otherState and tnow < otherState.invulnUntil) then
							local _, oh, orh = getCharacterParts(other)
							if oh and orh and HitboxUtil.flat(orh.Position - castPos).Magnitude <= w.range then
								damageVictim(player, oh, w.damage)
							end
						end
					end
				end
				CombatRemote:FireAllClients("SkillEffect", {
					userId = player.UserId,
					weaponId = "hammer",
					kind = "sweep",
					hitType = "circle",
					origin = castPos,
					range = w.range,
					color = WeaponConfig.getWeapon("hammer").color,
				})
			end)
		end
		return
	end

	-- TODO: remaining skills — bow railgun, spear throw, greatsword charge,
	-- dagger QTE, katana dash-waves, magicstaff spells.
end

-- R abilities (alt-skill): sniper random teleport, magicstaff self-heal,
-- katana iaijutsu forward slash. (Greatsword charge / other holds come later.)
local function performAltSkill(player: Player)
	local state = getState(player)
	local now = os.clock()
	if now < state.altReadyAt then
		return
	end
	local _, humanoid, root = getCharacterParts(player)
	if not humanoid or not root then
		return
	end
	local weaponId = state.weaponId
	local color = WeaponConfig.getWeapon(weaponId).color

	if weaponId == "sniper" then
		state.altReadyAt = now + WeaponConfig.Skill.sniper.teleportCooldown
		local x = (math.random() * 2 - 1) * 60
		local z = (math.random() * 2 - 1) * 60
		root.CFrame = CFrame.new(x, root.Position.Y, z)
		CombatRemote:FireAllClients("DashEffect", { userId = player.UserId })
		return
	end

	if weaponId == "magicstaff" then
		state.altReadyAt = now + WeaponConfig.Magic.lifebound.cooldown
		humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + WeaponConfig.Magic.lifebound.heal)
		CombatRemote:FireAllClients("SkillEffect", {
			userId = player.UserId, kind = "sweep", hitType = "circle",
			origin = root.Position, range = 3.5, color = Color3.fromRGB(80, 255, 140),
		})
		return
	end

	if weaponId == "katana" then
		local sk = WeaponConfig.Skill.katana
		state.altReadyAt = now + sk.iaijutsuCooldown
		local origin = root.Position
		local direction = HitboxUtil.safeUnit(state.aimDirection, HitboxUtil.safeUnit(root.CFrame.LookVector))
		local shape = { hitType = "line", range = sk.iaijutsuRange, width = sk.iaijutsuWidth }
		local hitPoints = {}
		for _, other in ipairs(Players:GetPlayers()) do
			if other ~= player then
				local otherState = states[other]
				if otherState and now < otherState.invulnUntil then
					continue
				end
				local _, otherHumanoid, otherRoot = getCharacterParts(other)
				if otherHumanoid and otherRoot and HitboxUtil.check(origin, direction, otherRoot.Position, shape) then
					table.insert(hitPoints, otherRoot.Position)
					damageVictim(player, otherHumanoid, sk.iaijutsuDamage)
				end
			end
		end
		CombatRemote:FireAllClients("SkillEffect", {
			userId = player.UserId, kind = "sweep", hitType = "line",
			origin = origin, direction = direction, range = sk.iaijutsuRange,
			width = sk.iaijutsuWidth, color = color, hits = hitPoints,
		})
		return
	end
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
		state.buffType = nil
		state.skillReadyAt = 0
		state.altReadyAt = 0
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
	elseif action == "Skill" then
		performSkill(player)
	elseif action == "AltSkill" then
		performAltSkill(player)
	end
end)

-- Per-frame: expire buffs + drive auto-attack (non-F-triggered weapons swing on
-- their own cadence; attack() self-gates on the per-swing cooldown).
RunService.Heartbeat:Connect(function(dt)
	local now = os.clock()
	for player, state in pairs(states) do
		if state.buffType and now > state.buffExpire then
			clearBuff(player, state)
		end
		if WeaponConfig.getWeapon(state.weaponId).automaticAttack ~= false then
			attack(player)
		end
	end

	-- Advance + resolve projectiles (move, bounds/range expiry, contact damage).
	for i = #projectiles, 1, -1 do
		local p = projectiles[i]
		local step = p.speed * dt
		p.pos += p.dir * step
		p.remaining -= step
		local dead = p.remaining <= 0 or math.abs(p.pos.X) > 70 or math.abs(p.pos.Z) > 70
		if not dead then
			for _, other in ipairs(Players:GetPlayers()) do
				if other ~= p.owner and not p.hitSet[other] then
					local otherState = states[other]
					if not (otherState and now < otherState.invulnUntil) then
						local _, otherHumanoid, otherRoot = getCharacterParts(other)
						if otherHumanoid and otherRoot
							and HitboxUtil.flat(otherRoot.Position - p.pos).Magnitude <= p.radius + PROJ_TARGET_RADIUS then
							damageVictim(p.owner, otherHumanoid, p.damage)
							p.hitSet[other] = true
							CombatRemote:FireAllClients("Spark", { pos = otherRoot.Position, color = p.color })
							if not p.pierce then
								dead = true
								break
							end
						end
					end
				end
			end
		end
		if dead then
			table.remove(projectiles, i)
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
