local Players = game:GetService("Players")
local Lighting = game:GetService("Lighting")
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
	stunnedUntil: number,
	bowStacks: number,
	inGame: boolean,
	greatswordChargeStart: number?,
	katanaChargeStart: number?,
	daggerQte: any?,
}

local states: { [Player]: PlayerState } = {}
local projectiles = {} -- live server-simulated projectiles (waves, fireballs, …)
local PROJ_TARGET_RADIUS = 2 -- studs; combatant body half-size for projectile contact
local NO_BASIC_ATTACK = { greatsword = true, matchlock = true, sniper = true }
local ARENA_FLOOR = Color3.fromRGB(18, 24, 33)
local WEB_CYAN = Color3.fromRGB(69, 243, 255)

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

local function configureWorldLighting()
	Lighting.Brightness = 0.65
	Lighting.ClockTime = 0
	Lighting.GlobalShadows = false
	Lighting.Ambient = Color3.fromRGB(18, 18, 24)
	Lighting.OutdoorAmbient = Color3.fromRGB(4, 4, 8)
	Lighting.EnvironmentDiffuseScale = 0
	Lighting.EnvironmentSpecularScale = 0
	Lighting.FogColor = Color3.fromRGB(0, 0, 0)
	Lighting.FogEnd = 260
end

local function ensureVoidBackdrop(parent: Instance)
	if parent:FindFirstChild("VoidBackdrop") then
		return
	end

	local part = Instance.new("Part")
	part.Name = "VoidBackdrop"
	part.Anchored = true
	part.Size = Vector3.new(420, 1, 420)
	part.Position = Vector3.new(0, -1.15, 0)
	part.Color = Color3.fromRGB(0, 0, 0)
	part.Material = Enum.Material.SmoothPlastic
	part.Transparency = 0
	part.CanCollide = false
	part.CanQuery = false
	part.CastShadow = false
	part.Reflectance = 0
	part.Parent = parent
end

local function ensureArena()
	configureWorldLighting()

	local existingArena = workspace:FindFirstChild("PixelRoyaleArena")
	if existingArena then
		ensureVoidBackdrop(existingArena)
		for _, descendant in ipairs(existingArena:GetDescendants()) do
			if descendant:IsA("BasePart") then
				descendant.Reflectance = 0
				if descendant.Name:find("Wall") or descendant.Name:find("NeonEdge") then
					descendant.Color = WEB_CYAN
				elseif descendant.Name == "ArenaFloor" then
					descendant.Material = Enum.Material.Slate
					descendant.Color = ARENA_FLOOR
				end
			end
		end
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
		part.Reflectance = 0
		part.Parent = arena
		return part
	end

	ensureVoidBackdrop(arena)

	local floor = Instance.new("Part")
	floor.Name = "ArenaFloor"
	floor.Anchored = true
	floor.Size = Vector3.new(140, 1, 140)
	floor.Position = Vector3.new(0, -0.45, 0)
	floor.Color = ARENA_FLOOR
	floor.Material = Enum.Material.Slate
	floor.CastShadow = false
	floor.Reflectance = 0
	floor.Parent = arena

	for offset = -63, 63, 7 do
		staticPart("GridX_" .. tostring(offset), Vector3.new(140, 0.08, 0.08), Vector3.new(0, 0.09, offset), Color3.fromRGB(45, 68, 82), Enum.Material.Neon, 0.68, false)
		staticPart("GridZ_" .. tostring(offset), Vector3.new(0.08, 0.08, 140), Vector3.new(offset, 0.1, 0), Color3.fromRGB(45, 68, 82), Enum.Material.Neon, 0.68, false)
	end

	staticPart("NorthWall", Vector3.new(142, 8, 2), Vector3.new(0, 3.5, -71), WEB_CYAN, Enum.Material.SmoothPlastic, 1, true)
	staticPart("SouthWall", Vector3.new(142, 8, 2), Vector3.new(0, 3.5, 71), WEB_CYAN, Enum.Material.SmoothPlastic, 1, true)
	staticPart("EastWall", Vector3.new(2, 8, 142), Vector3.new(71, 3.5, 0), WEB_CYAN, Enum.Material.SmoothPlastic, 1, true)
	staticPart("WestWall", Vector3.new(2, 8, 142), Vector3.new(-71, 3.5, 0), WEB_CYAN, Enum.Material.SmoothPlastic, 1, true)

	staticPart("NorthNeonEdge", Vector3.new(142, 0.25, 0.45), Vector3.new(0, 0.3, -70), WEB_CYAN, Enum.Material.Neon, 0.05, false)
	staticPart("SouthNeonEdge", Vector3.new(142, 0.25, 0.45), Vector3.new(0, 0.3, 70), WEB_CYAN, Enum.Material.Neon, 0.05, false)
	staticPart("EastNeonEdge", Vector3.new(0.45, 0.25, 142), Vector3.new(70, 0.3, 0), WEB_CYAN, Enum.Material.Neon, 0.05, false)
	staticPart("WestNeonEdge", Vector3.new(0.45, 0.25, 142), Vector3.new(-70, 0.3, 0), WEB_CYAN, Enum.Material.Neon, 0.05, false)
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
		stunnedUntil = 0,
		bowStacks = 0,
		inGame = false,
		greatswordChargeStart = nil,
		katanaChargeStart = nil,
		daggerQte = nil,
	}
	states[player] = state
	player:SetAttribute("Weapon", state.weaponId)
	player:SetAttribute("AimX", state.aimDirection.X)
	player:SetAttribute("AimZ", state.aimDirection.Z)
	player:SetAttribute("BowStacks", state.bowStacks)
	player:SetAttribute("InGame", state.inGame)
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
	local moveSpeed = weapon.moveSpeed
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

local function canHitTarget(attacker: Player, target: Player, now: number): boolean
	if target == attacker then
		return false
	end
	local targetState = states[target]
	return targetState ~= nil and targetState.inGame and now >= targetState.invulnUntil
end

local function setBowStacks(player: Player, state: PlayerState, stacks: number)
	local maxStacks = WeaponConfig.Skill.bow.maxStacks or 5
	state.bowStacks = math.clamp(stacks, 0, maxStacks)
	player:SetAttribute("BowStacks", state.bowStacks)
end

local function addBowStack(player: Player, amount: number)
	local state = getState(player)
	setBowStacks(player, state, state.bowStacks + amount)
end

local function applyBurn(attacker: Player, victimHumanoid: Humanoid, dps: number?, duration: number?)
	if not dps or not duration or dps <= 0 or duration <= 0 then
		return
	end

	local tickInterval = 0.5
	local ticks = math.floor(duration / tickInterval)
	task.spawn(function()
		for _ = 1, ticks do
			task.wait(tickInterval)
			if victimHumanoid.Health <= 0 then
				return
			end
			damageVictim(attacker, victimHumanoid, dps * tickInterval)
		end
	end)
end

local function stunPlayer(player: Player, duration: number)
	local state = getState(player)
	state.stunnedUntil = math.max(state.stunnedUntil, os.clock() + duration)
	local _, humanoid = getCharacterParts(player)
	if humanoid then
		humanoid.WalkSpeed = 0
		task.delay(duration, function()
			if states[player] == state then
				applyWeaponStats(player)
			end
		end)
	end
end

local function findNearestEnemy(player: Player, origin: Vector3, maxRange: number)
	local bestPlayer = nil
	local bestHumanoid = nil
	local bestRoot = nil
	local bestDist = nil
	local now = os.clock()
	for _, other in ipairs(Players:GetPlayers()) do
		if canHitTarget(player, other, now) then
			local _, humanoid, root = getCharacterParts(other)
			if humanoid and root then
				local dist = HitboxUtil.flat(root.Position - origin).Magnitude
				if dist <= maxRange and (not bestDist or dist < bestDist) then
					bestPlayer = other
					bestHumanoid = humanoid
					bestRoot = root
					bestDist = dist
				end
			end
		end
	end
	return bestPlayer, bestHumanoid, bestRoot, bestDist
end

local function withFinisher(base, finisher)
	local swing = table.clone(base)
	for key, value in pairs(finisher) do
		swing[key] = value
	end
	return swing
end

local spawnProjectile

local function castIceShards(player: Player, target: Vector3?)
	local state = getState(player)
	local ice = WeaponConfig.Magic.iceShard
	local _, humanoid, root = getCharacterParts(player)
	if not humanoid or not root then
		return
	end

	local now = os.clock()
	if now - state.lastAttack < ice.cooldown then
		return
	end
	state.lastAttack = now
	state.attackCooldown = ice.cooldown

	local targetPoint = if typeof(target) == "Vector3" then target else root.Position + state.aimDirection * 20
	CombatRemote:FireAllClients("Telegraph", {
		userId = player.UserId,
		kind = "magic_target",
		hitType = "circle",
		origin = targetPoint,
		range = 3.8,
		duration = 0.45,
		color = Color3.fromRGB(80, 170, 255),
	})
	for i = 1, ice.count do
		task.delay((i - 1) * ice.interval, function()
			local _, hum, rt = getCharacterParts(player)
			if not (hum and rt) then
				return
			end
			local direction = HitboxUtil.safeUnit(targetPoint - rt.Position, state.aimDirection)
			spawnProjectile(player, rt.Position, direction, {
				kind = "ice_shard",
				speed = ice.speed,
				range = WeaponConfig.REACH,
				damage = ice.damage,
				radius = ice.radius,
				color = WeaponConfig.getWeapon("magicstaff").color,
			})
		end)
	end
	CombatRemote:FireAllClients("Telegraph", {
		userId = player.UserId,
		hitType = "line",
		origin = root.Position,
		direction = HitboxUtil.safeUnit(targetPoint - root.Position, state.aimDirection),
		range = WeaponConfig.REACH,
		width = 0.7,
		duration = 0.3,
		color = WeaponConfig.getWeapon("magicstaff").color,
	})
end

local function attack(player: Player, payload)
	local state = getState(player)
	if not state.inGame or os.clock() < state.stunnedUntil then
		return
	end

	if NO_BASIC_ATTACK[state.weaponId] then
		return
	end

	if state.weaponId == "magicstaff" then
		castIceShards(player, if typeof(payload) == "table" then payload.target else nil)
		return
	end

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

	local origin = root.Position
	local direction = HitboxUtil.safeUnit(state.aimDirection, HitboxUtil.safeUnit(root.CFrame.LookVector))
	if state.weaponId == "bow" then
		state.lastAttack = now
		state.attackCooldown = weapon.cooldown
		spawnProjectile(player, origin, direction, {
			kind = "bow_arrow",
			speed = weapon.projectileSpeed or 64,
			range = WeaponConfig.REACH,
			damage = weapon.damage,
			radius = math.max(weapon.width or 0.6, 0.55),
			color = weapon.color,
		})
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

	local hitCount = 0
	local hitPoints = {}

	for _, other in ipairs(Players:GetPlayers()) do
		if canHitTarget(player, other, now) then
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
		vfx = swing.vfx or weapon.vfx,
		follow = swing.hitType ~= "projectile",
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

	if state.weaponId == "bow" and hitCount > 0 then
		addBowStack(player, hitCount)
	end
end

-- Spawn a server-simulated projectile + tell clients to render it flying.
function spawnProjectile(owner: Player, origin: Vector3, direction: Vector3, opts)
	table.insert(projectiles, {
		owner = owner,
		kind = opts.kind,
		pos = origin,
		dir = direction,
		speed = opts.speed,
		remaining = opts.range,
		damage = opts.damage,
		radius = opts.radius or 0.6,
		pierce = opts.pierce or false,
		color = opts.color,
		burnDps = opts.burnDps,
		burnDuration = opts.burnDuration,
		hitSet = {},
	})
	CombatRemote:FireAllClients("Projectile", {
		kind = opts.kind,
		origin = origin,
		direction = direction,
		speed = opts.speed,
		range = opts.range,
		radius = opts.radius or 0.6,
		color = opts.color,
	})
end

-- Damage every valid target inside a hit shape; returns the contact points.
local function damageInShape(attacker: Player, origin: Vector3, direction: Vector3, shape, damage: number)
	local hits = {}
	local now = os.clock()
	for _, other in ipairs(Players:GetPlayers()) do
		if canHitTarget(attacker, other, now) then
			local _, otherHumanoid, otherRoot = getCharacterParts(other)
			if otherHumanoid and otherRoot and HitboxUtil.check(origin, direction, otherRoot.Position, shape) then
				table.insert(hits, otherRoot.Position)
				damageVictim(attacker, otherHumanoid, damage)
			end
		end
	end
	return hits
end

local function clearBuff(player: Player, state: PlayerState)
	if state.buffType then
		state.buffType = nil
		applyWeaponStats(player)
	end
end

local function performSkill(player: Player)
	local state = getState(player)
	if not state.inGame or os.clock() < state.stunnedUntil then
		return
	end
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
			if canHitTarget(player, other, now) then
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
			follow = true,
			vfx = sk.vfx,
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
						kind = "sword_wave",
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
		local maxRange = sk.waves[#sk.waves].range
		CombatRemote:FireAllClients("Telegraph", {
			userId = player.UserId,
			weaponId = "hammer",
			hitType = "circle",
			follow = true,
			grow = true,
			origin = root.Position,
			range = maxRange,
			duration = sk.preview,
			color = WeaponConfig.getWeapon("hammer").color,
		})
		local t = sk.preview
		for idx, wave in ipairs(sk.waves) do
			t += sk.waveDelays[idx]
			local w = wave
			task.delay(t, function()
				local tnow = os.clock()
				local _, hum, rt = getCharacterParts(player)
				if not (hum and rt) then
					return
				end
				local waveOrigin = rt.Position
				for _, other in ipairs(Players:GetPlayers()) do
					if canHitTarget(player, other, tnow) then
						local _, oh, orh = getCharacterParts(other)
						if oh and orh and HitboxUtil.flat(orh.Position - waveOrigin).Magnitude <= w.range then
							damageVictim(player, oh, w.damage)
							if w.stun then
								stunPlayer(other, w.stun)
							end
						end
					end
				end
				CombatRemote:FireAllClients("SkillEffect", {
					userId = player.UserId,
					weaponId = "hammer",
					kind = "sweep",
					hitType = "circle",
					origin = waveOrigin,
					range = w.range,
					color = WeaponConfig.getWeapon("hammer").color,
				})
			end)
		end
		return
	end

	local aim = HitboxUtil.safeUnit(state.aimDirection, HitboxUtil.safeUnit(root.CFrame.LookVector))
	local weaponColor = WeaponConfig.getWeapon(state.weaponId).color

	-- Bow F: instant piercing railgun beam.
	if state.weaponId == "bow" then
		if state.bowStacks <= 0 then
			return
		end
		local stacks = state.bowStacks
		setBowStacks(player, state, 0)
		state.skillReadyAt = now + sk.cooldown
		for i = 1, stacks do
			task.delay((i - 1) * sk.burstInterval, function()
				local _, hum, rt = getCharacterParts(player)
				if not (hum and rt) then
					return
				end
				local beamAim = HitboxUtil.safeUnit(state.aimDirection, aim)
				local shape = { hitType = "line", range = WeaponConfig.REACH, width = 0.9 }
				local hits = damageInShape(player, rt.Position, beamAim, shape, sk.damage)
				CombatRemote:FireAllClients("SkillEffect", {
					userId = player.UserId, kind = "sweep", hitType = "line", origin = rt.Position,
					direction = beamAim, range = WeaponConfig.REACH, width = 0.9, color = weaponColor, hits = hits,
				})
			end)
		end
		return
	end

	-- Spear F: instant throw line, then a return line after a short delay.
	if state.weaponId == "spear" then
		state.skillReadyAt = now + sk.cooldown
		local shape = { hitType = "line", range = WeaponConfig.REACH, width = 1.6 }
		local hits = damageInShape(player, root.Position, aim, shape, sk.damage)
		CombatRemote:FireAllClients("SkillEffect", {
			userId = player.UserId, kind = "sweep", hitType = "line", origin = root.Position,
			direction = aim, range = WeaponConfig.REACH, width = 1.6, color = weaponColor, hits = hits,
		})
		task.delay(0.5, function()
			local _, hum, rt = getCharacterParts(player)
			if rt and hum then
				local returnAim = HitboxUtil.safeUnit(state.aimDirection, aim)
				local h2 = damageInShape(player, rt.Position, returnAim, shape, sk.returnDamage)
				CombatRemote:FireAllClients("SkillEffect", {
					userId = player.UserId, kind = "sweep", hitType = "line", origin = rt.Position,
					direction = returnAim, range = WeaponConfig.REACH, width = 1.6, color = weaponColor, hits = h2,
				})
			end
		end)
		return
	end

	-- Katana F: two quick arc slashes, each launching a blade-wave projectile.
	if state.weaponId == "katana" then
		state.skillReadyAt = now + sk.cooldown
		for i = 1, sk.slashCount do
			task.delay((i - 1) * sk.slashInterval, function()
				local _, hum, rt = getCharacterParts(player)
				if not (rt and hum) then
					return
				end
				local slashAim = HitboxUtil.safeUnit(state.aimDirection, aim)
				local arc = { hitType = "arc", range = sk.directRange, angle = sk.directAngle }
				local hits = damageInShape(player, rt.Position, slashAim, arc, sk.directDamage)
				CombatRemote:FireAllClients("SkillEffect", {
					userId = player.UserId, kind = "sweep", hitType = "arc", origin = rt.Position,
					direction = slashAim, range = sk.directRange, angle = sk.directAngle, color = weaponColor,
					vfx = sk.vfx, follow = true, hits = hits,
				})
				spawnProjectile(player, rt.Position, slashAim, {
					kind = "sword_wave", speed = sk.waveSpeed, range = WeaponConfig.REACH,
					damage = sk.waveDamage, radius = 0.8, color = weaponColor,
				})
			end)
		end
		return
	end

	-- Greatsword F is handled by SkillStart / SkillRelease so hold duration is authoritative.
	if state.weaponId == "greatsword" then
		return
	end

	-- Dagger F: lock onto nearest enemy and wait for the client timing press.
	if state.weaponId == "dagger" then
		state.skillReadyAt = now + sk.cooldown
		local targetPlayer = findNearestEnemy(player, root.Position, 18)
		if targetPlayer then
			local qteExpire = now + sk.lock + sk.window
			state.invulnUntil = math.max(state.invulnUntil, qteExpire)
			state.daggerQte = {
				target = targetPlayer,
				startedAt = now,
				expiresAt = qteExpire,
			}
			CombatRemote:FireClient(player, "QTEStart", {
				targetUserId = targetPlayer.UserId,
				lock = sk.lock,
				window = sk.window,
				perfect = sk.perfect,
				tolerance = sk.tolerance,
			})
		end
		return
	end

	-- Magic staff F: launch a fireball projectile that burns after direct contact.
	if state.weaponId == "magicstaff" then
		local fb = WeaponConfig.Magic.fireball
		state.skillReadyAt = now + fb.cooldown
		spawnProjectile(player, root.Position, aim, {
			kind = "fireball",
			speed = fb.speed, range = WeaponConfig.REACH, damage = fb.damage,
			radius = math.max(fb.radius, 1), color = weaponColor,
			burnDps = fb.burnDps,
			burnDuration = fb.burnDuration,
		})
		return
	end

	if state.weaponId == "sniper" then
		local weapon = WeaponConfig.getWeapon("sniper")
		state.skillReadyAt = now + sk.cooldown
		local shape = { hitType = "line", range = WeaponConfig.REACH, width = weapon.width }
		local hits = damageInShape(player, root.Position, aim, shape, weapon.damage)
		CombatRemote:FireAllClients("SkillEffect", {
			userId = player.UserId, kind = "sweep", hitType = "line", origin = root.Position,
			direction = aim, range = WeaponConfig.REACH, width = weapon.width, color = weaponColor, hits = hits,
		})
		return
	end

	if state.weaponId == "matchlock" then
		local weapon = WeaponConfig.getWeapon("matchlock")
		state.skillReadyAt = now + sk.cooldown
		spawnProjectile(player, root.Position, aim, {
			kind = "matchlock_shot",
			speed = 110,
			range = WeaponConfig.REACH,
			damage = sk.damage or weapon.damage,
			radius = math.max(weapon.width or 0.45, 0.45),
			color = weaponColor,
		})
		return
	end
end

local function startSkill(player: Player)
	local state = getState(player)
	local now = os.clock()
	if not state.inGame or os.clock() < state.stunnedUntil then
		return
	end
	if state.weaponId ~= "greatsword" then
		performSkill(player)
		return
	end
	if now < state.skillReadyAt then
		return
	end

	local sk = WeaponConfig.Skill.greatsword
	local _, humanoid, root = getCharacterParts(player)
	if not humanoid or not root then
		return
	end

	state.greatswordChargeStart = now
	CombatRemote:FireAllClients("Telegraph", {
		userId = player.UserId,
		weaponId = "greatsword",
		hitType = sk.hitType,
		follow = true,
		origin = root.Position,
		direction = HitboxUtil.safeUnit(state.aimDirection, HitboxUtil.safeUnit(root.CFrame.LookVector)),
		range = sk.range,
		angle = sk.angle,
		duration = sk.chargeMax,
		color = WeaponConfig.getWeapon("greatsword").color,
	})
end

local function releaseSkill(player: Player)
	local state = getState(player)
	if not state.inGame then
		return
	end
	if state.weaponId ~= "greatsword" then
		return
	end

	local chargeStart = state.greatswordChargeStart
	if not chargeStart then
		return
	end
	state.greatswordChargeStart = nil

	local now = os.clock()
	local sk = WeaponConfig.Skill.greatsword
	if now < state.skillReadyAt then
		return
	end

	local _, humanoid, root = getCharacterParts(player)
	if not humanoid or not root then
		return
	end

	local held = math.clamp(now - chargeStart, 0, sk.chargeMax)
	local damage = sk.minDamage
	if held >= sk.chargeThreshold then
		local t = math.clamp((held - sk.chargeThreshold) / math.max(sk.chargeMax - sk.chargeThreshold, 0.01), 0, 1)
		damage = sk.thresholdDamage + (sk.damage - sk.thresholdDamage) * t
	end

	state.skillReadyAt = now + sk.cooldown
	local direction = HitboxUtil.safeUnit(state.aimDirection, HitboxUtil.safeUnit(root.CFrame.LookVector))
	task.delay(sk.delayDamage or 0, function()
		local _, hum, rt = getCharacterParts(player)
		if not (hum and rt) then
			return
		end
		local shape = { hitType = sk.hitType, range = sk.range, angle = sk.angle, bladeHalfWidth = sk.bladeHalfWidth }
		local hits = damageInShape(player, rt.Position, direction, shape, damage)
		CombatRemote:FireAllClients("SkillEffect", {
			userId = player.UserId,
			kind = "sweep",
			hitType = sk.hitType,
			vfx = sk.vfx,
			follow = true,
			origin = rt.Position,
			direction = direction,
			range = sk.range,
			angle = sk.angle,
			color = WeaponConfig.getWeapon("greatsword").color,
			hits = hits,
		})
	end)
end

local function resolveDaggerQTE(player: Player)
	local state = getState(player)
	if not state.inGame then
		return
	end
	local qte = state.daggerQte
	if not qte then
		return
	end
	state.daggerQte = nil

	local sk = WeaponConfig.Skill.dagger
	local now = os.clock()
	local targetPlayer = qte.target
	local _, humanoid, root = getCharacterParts(player)
	local _, targetHumanoid, targetRoot = getCharacterParts(targetPlayer)
	CombatRemote:FireClient(player, "QTEEnd")

	if not humanoid or not root or not targetHumanoid or not targetRoot or now > qte.expiresAt then
		state.invulnUntil = now
		return
	end

	local elapsedAfterLock = now - qte.startedAt - sk.lock
	local success = elapsedAfterLock >= 0 and math.abs(elapsedAfterLock - sk.perfect) <= sk.tolerance
	if success then
		local targetState = getState(targetPlayer)
		local behindDir = HitboxUtil.safeUnit(targetState.aimDirection, Vector3.new(0, 0, -1))
		local destination = targetRoot.Position - behindDir * 3.2
		root.CFrame = CFrame.new(destination.X, root.Position.Y, destination.Z)
		damageVictim(player, targetHumanoid, sk.damage)
		CombatRemote:FireAllClients("SkillEffect", {
			userId = player.UserId,
			kind = "sweep",
			hitType = "line",
			origin = root.Position,
			direction = HitboxUtil.safeUnit(targetRoot.Position - root.Position, state.aimDirection),
			range = 6.5,
			width = 0.5,
			color = WeaponConfig.getWeapon("dagger").color,
			hits = { targetRoot.Position },
		})
	else
		state.invulnUntil = now
		damageVictim(player, humanoid, sk.failDamage)
		stunPlayer(player, sk.failStun)
		CombatRemote:FireAllClients("Spark", { pos = root.Position, color = Color3.fromRGB(255, 80, 80) })
	end
end

-- R abilities (alt-skill): sniper random teleport, magicstaff self-heal,
-- katana iaijutsu forward slash. (Greatsword charge / other holds come later.)
local function performAltSkill(player: Player)
	local state = getState(player)
	if not state.inGame or os.clock() < state.stunnedUntil then
		return
	end
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

	local alt = WeaponConfig.AltSkill and WeaponConfig.AltSkill[weaponId]
	if alt then
		state.altReadyAt = now + (alt.cooldown or 0)
		local direction = HitboxUtil.safeUnit(state.aimDirection, HitboxUtil.safeUnit(root.CFrame.LookVector))
		local shape = {
			hitType = alt.hitType,
			range = alt.range,
			width = alt.width,
			angle = alt.angle,
		}
		local hitPoints = damageInShape(player, root.Position, direction, shape, alt.damage or 0)
		CombatRemote:FireAllClients("SkillEffect", {
			userId = player.UserId, kind = "sweep", hitType = alt.hitType,
			origin = root.Position, direction = direction, range = alt.range,
			width = alt.width, angle = alt.angle, color = color, hits = hitPoints,
			vfx = alt.vfx or WeaponConfig.getWeapon(weaponId).vfx,
			follow = alt.hitType == "circle" or alt.hitType == "arc" or alt.hitType == "blade_sweep",
		})
		return
	end
end

local function startAltSkill(player: Player)
	local state = getState(player)
	local now = os.clock()
	if not state.inGame or now < state.stunnedUntil then
		return
	end
	if state.weaponId ~= "katana" then
		performAltSkill(player)
		return
	end
	if now < state.altReadyAt or state.katanaChargeStart then
		return
	end

	local _, humanoid, root = getCharacterParts(player)
	if not humanoid or not root then
		return
	end

	local sk = WeaponConfig.Skill.katana
	state.katanaChargeStart = now
	CombatRemote:FireAllClients("Telegraph", {
		userId = player.UserId,
		weaponId = "katana",
		hitType = "line",
		follow = true,
		origin = root.Position,
		direction = HitboxUtil.safeUnit(state.aimDirection, HitboxUtil.safeUnit(root.CFrame.LookVector)),
		range = sk.iaijutsuRange,
		width = sk.iaijutsuWidth,
		duration = sk.iaijutsuCharge,
		color = WeaponConfig.getWeapon("katana").color,
	})
end

local function releaseAltSkill(player: Player)
	local state = getState(player)
	local now = os.clock()
	if not state.inGame or now < state.stunnedUntil or state.weaponId ~= "katana" then
		return
	end

	local chargeStart = state.katanaChargeStart
	if not chargeStart then
		return
	end
	state.katanaChargeStart = nil
	if now < state.altReadyAt then
		return
	end

	local _, humanoid, root = getCharacterParts(player)
	if not humanoid or not root then
		return
	end

	local sk = WeaponConfig.Skill.katana
	local held = math.clamp(now - chargeStart, 0, sk.iaijutsuCharge)
	local chargeRatio = math.clamp(held / math.max(sk.iaijutsuCharge, 0.01), 0, 1)
	local damage = math.max(1, math.floor(sk.iaijutsuDamage * chargeRatio + 0.5))
	local direction = HitboxUtil.safeUnit(state.aimDirection, HitboxUtil.safeUnit(root.CFrame.LookVector))
	local shape = { hitType = "line", range = sk.iaijutsuRange, width = sk.iaijutsuWidth }
	local hits = damageInShape(player, root.Position, direction, shape, damage)
	state.altReadyAt = now + sk.iaijutsuCooldown

	CombatRemote:FireAllClients("SkillEffect", {
		userId = player.UserId,
		kind = "sweep",
		hitType = "line",
		vfx = sk.vfx,
		origin = root.Position,
		direction = direction,
		range = sk.iaijutsuRange,
		width = sk.iaijutsuWidth,
		color = WeaponConfig.getWeapon("katana").color,
		hits = hits,
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
		state.buffType = nil
		state.skillReadyAt = 0
		state.altReadyAt = 0
		state.greatswordChargeStart = nil
		state.katanaChargeStart = nil
		state.daggerQte = nil
		if payload ~= "bow" then
			setBowStacks(player, state, 0)
		end
		applyWeaponStats(player)
	elseif action == "EnterGame" then
		state.inGame = true
		player:SetAttribute("InGame", true)
		local character = player.Character
		if character then
			spawnNearArena(player, character)
		end
		applyWeaponStats(player)
	elseif action == "LeaveGame" then
		state.inGame = false
		state.buffType = nil
		state.daggerQte = nil
		state.greatswordChargeStart = nil
		state.katanaChargeStart = nil
		state.comboStep = 0
		state.attackCooldown = 0
		player:SetAttribute("InGame", false)
		setBowStacks(player, state, 0)
		applyWeaponStats(player)
	elseif action == "Attack" then
		attack(player, payload)
	elseif action == "Dash" then
		local now = os.clock()
		if state.inGame and now - state.lastDash >= Dash.cooldown then
			state.lastDash = now
			state.invulnUntil = now + Dash.iframe
			CombatRemote:FireAllClients("DashEffect", {
				userId = player.UserId,
				iframe = Dash.iframe,
			})
		end
	elseif action == "Skill" then
		performSkill(player)
	elseif action == "SkillStart" then
		startSkill(player)
	elseif action == "SkillRelease" then
		releaseSkill(player)
	elseif action == "DaggerQTE" then
		resolveDaggerQTE(player)
	elseif action == "AltSkill" then
		performAltSkill(player)
	elseif action == "AltStart" then
		startAltSkill(player)
	elseif action == "AltRelease" then
		releaseAltSkill(player)
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
		if state.daggerQte and now > state.daggerQte.expiresAt then
			state.daggerQte = nil
			CombatRemote:FireClient(player, "QTEEnd")
		end
		if state.inGame and WeaponConfig.getWeapon(state.weaponId).automaticAttack ~= false then
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
				if not p.hitSet[other] and canHitTarget(p.owner, other, now) then
					local _, otherHumanoid, otherRoot = getCharacterParts(other)
					if otherHumanoid and otherRoot
						and HitboxUtil.flat(otherRoot.Position - p.pos).Magnitude <= p.radius + PROJ_TARGET_RADIUS then
						damageVictim(p.owner, otherHumanoid, p.damage)
						applyBurn(p.owner, otherHumanoid, p.burnDps, p.burnDuration)
						if p.kind == "bow_arrow" then
							addBowStack(p.owner, 1)
						end
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
