-- Weapon + combat tuning, ported 1:1 from the web build's game/Weapons.js.
-- UNIT CONVENTIONS (web -> Roblox):
--   distance  px      -> studs   (divide by PX_PER_STUD = 10)   e.g. 70px -> 7
--   speed     px/s    -> studs/s (divide by 10)                 e.g. 640  -> 64
--   time      ms      -> seconds (divide by 1000)               e.g. 4000 -> 4
--   "to the wall"/Infinity ranges use REACH (spans the whole arena).
local WeaponConfig = {}

WeaponConfig.PX_PER_STUD = 10
WeaponConfig.REACH = 200 -- studs; stand-in for the web's Infinity (arena diagonal ~198)
WeaponConfig.BaseWalkSpeed = 20
WeaponConfig.DefaultWeapon = "sword"

WeaponConfig.Order = {
	"sword", "axe", "bow", "spear", "gauntlet", "greatsword", "scythe",
	"dagger", "rapier", "hammer", "matchlock", "katana", "magicstaff", "sniper",
}

-- hitType: arc | circle | line | sweet_arc | precise_line | slam | blade_sweep | projectile
WeaponConfig.Weapons = {
	sword = {
		displayName = "Sword", damage = 24, maxHealth = 120, cooldown = 0.55,
		moveSpeed = 1.1, range = 7, angle = 110, hitType = "blade_sweep",
		bladeHalfWidth = 1.2, vfx = "slash", color = Color3.fromRGB(69, 243, 255),
	},
	axe = {
		displayName = "Axe", damage = 36, maxHealth = 150, cooldown = 0.82,
		moveSpeed = 0.85, range = 6.3, angle = 360, hitType = "circle", vfx = "slash",
		color = Color3.fromRGB(245, 85, 85),
	},
	bow = {
		displayName = "Bow", damage = 33, maxHealth = 80, cooldown = 0.8,
		moveSpeed = 1, range = WeaponConfig.REACH, width = 0.6, projectileSpeed = 64,
		hitType = "projectile", color = Color3.fromRGB(163, 255, 69),
	},
	spear = {
		displayName = "Spear", damage = 17, maxHealth = 100, cooldown = 0.5,
		moveSpeed = 1, range = 12, width = 1.6, hitType = "line",
		color = Color3.fromRGB(255, 163, 69),
	},
	gauntlet = {
		displayName = "Gauntlet", damage = 19, maxHealth = 110, cooldown = 0.16,
		moveSpeed = 1.3, range = 5.8, angle = 110, hitType = "arc", vfx = "punch",
		color = Color3.fromRGB(255, 69, 219),
	},
	greatsword = {
		displayName = "Greatsword", damage = 38, maxHealth = 140, cooldown = 0.9,
		automaticAttack = false, moveSpeed = 0.82, range = 8.8, angle = 210,
		fixedSwingDirection = 1, hitType = "arc", color = Color3.fromRGB(139, 211, 255),
	},
	scythe = {
		displayName = "Scythe", damage = 18, sweetDamage = 34, maxHealth = 115,
		cooldown = 0.68, moveSpeed = 1.05, range = 9.2, innerRange = 5.2, angle = 190,
		pull = 2.4, fixedSwingDirection = 1, hitType = "sweet_arc", bladeHalfWidth = 1.6,
		color = Color3.fromRGB(217, 70, 239),
	},
	dagger = {
		displayName = "Dagger", damage = 14, maxHealth = 90, cooldown = 0.3,
		moveSpeed = 1.35, range = 5.8, width = 0.1, critDamage = 20,
		hitCooldownRefund = 0.04, hitType = "precise_line",
		color = Color3.fromRGB(248, 250, 252),
	},
	rapier = {
		displayName = "Rapier", damage = 20, critDamage = 24, maxHealth = 100,
		cooldown = 0.43, moveSpeed = 1.15, range = 8.7, width = 0.1,
		hitCooldownRefund = 0.18, missPenalty = 0.15, hitType = "precise_line",
		color = Color3.fromRGB(250, 204, 21),
	},
	hammer = {
		displayName = "Hammer", damage = 36, maxHealth = 145, cooldown = 1.15,
		moveSpeed = 0.75, range = 7.8, innerRange = 3.6, angle = 360, knockback = 6.8,
		hitType = "slam", color = Color3.fromRGB(251, 146, 60),
	},
	matchlock = {
		displayName = "Matchlock", damage = 9999, maxHealth = 80, cooldown = 15,
		automaticAttack = false, moveSpeed = 0.9, range = WeaponConfig.REACH,
		width = 0.45, hitType = "projectile", color = Color3.fromRGB(239, 68, 68),
	},
	katana = {
		displayName = "Katana", damage = 24, maxHealth = 110, cooldown = 0.43,
		moveSpeed = 1.2, range = 7, angle = 110, hitType = "blade_sweep",
		bladeHalfWidth = 1.2, vfx = "slash", color = Color3.fromRGB(244, 63, 94),
	},
	magicstaff = {
		displayName = "Magic Staff", damage = 40, maxHealth = 95, cooldown = 2,
		automaticAttack = false, moveSpeed = 0.9, range = WeaponConfig.REACH,
		width = 0.7, projectileSpeed = 54, hitType = "projectile",
		color = Color3.fromRGB(168, 85, 247),
	},
	sniper = {
		displayName = "Sniper", damage = 9999, maxHealth = 90, cooldown = 2,
		automaticAttack = false, moveSpeed = 0, range = WeaponConfig.REACH,
		width = 0.35, hitType = "projectile", color = Color3.fromRGB(34, 197, 94),
	},
}

-- Dash (Spacebar). distance 130px -> 13 studs; iframe 13 frames @60fps.
WeaponConfig.Dash = {
	distance = 13,
	duration = 0.16,
	iframe = 13 / 60, -- ~0.217s of invulnerability
	cooldown = 0.9,
}
WeaponConfig.Dash.speed = WeaponConfig.Dash.distance / WeaponConfig.Dash.duration -- studs/s

-- Per-weapon F skill tuning.
WeaponConfig.Skill = {
	sword = {
		cooldown = 4, waveSpeed = 80, waveCount = 3, waveInterval = 0.25,
		directDamage = 24, explosionRadius = 7, explosionDamage = 20,
	},
	axe = { -- "rage": stationary fan-slash buff
		cooldown = 6, buff = 4, hitType = "arc", vfx = "slash", damage = 48,
		attackCooldown = 0.32, range = 10, angle = 120,
	},
	bow = { -- stacking railgun burst
		cooldown = 8, damage = 60, maxStacks = 5, burstInterval = 0.25,
	},
	spear = { -- instant throw + return sweep
		cooldown = 2, damage = 35, returnDamage = 35, returnSpeed = 76, returnTime = 1.8,
	},
	gauntlet = { -- "lance": punches become a long line
		cooldown = 7, buff = 7, damage = 20, range = 11.5, width = 2.2, hitType = "line", vfx = "punch",
	},
	greatsword = { -- charge-up heavy cleave
		cooldown = 0.8, chargeMax = 1, chargeThreshold = 0.5, minDamage = 1,
		thresholdDamage = 35, damage = 70, hitType = "blade_sweep", range = 12.8,
		angle = 210, bladeHalfWidth = 1.8, delayDamage = 0.07, attackLock = 0.8, knockback = 8.2,
		vfx = "slash",
	},
	scythe = {
		cooldown = 6.5, hitType = "sweet_arc", damage = 24, sweetDamage = 46,
		range = 13, innerRange = 6.2, angle = 210, pull = 4.8,
	},
	dagger = { -- backstab QTE
		cooldown = 5, lock = 0.7, window = 0.9, perfect = 0.56, tolerance = 0.15,
		dashDistance = 6.4, damage = 70, failDamage = 10, failStun = 0.3,
	},
	rapier = { -- "riposte" buff
		cooldown = 6, buff = 5, hitType = "precise_line", buffCooldown = 0.25,
		buffRange = 10.5, buffWidth = 0.6, buffHitRefund = 0.25,
	},
	hammer = { -- 3 expanding shockwaves
		cooldown = 8.5, hitType = "slam", preview = 1, knockback = 9,
		waveDelays = { 0.8, 0.8, 1.2 },
		waves = {
			{ range = 6,    damage = 20, stun = 0.7,  knockback = 4 },
			{ range = 12.3, damage = 40, stun = 0.75, knockback = 7 },
			{ range = 15.6, damage = 52, stun = 1.1,  knockback = 10 },
		},
	},
	matchlock = { cooldown = 15, damage = 9999 },
	katana = { -- dash double-cut + wave; R = iaijutsu charge
		cooldown = 7, dashDistance = 15, slashCount = 2, slashInterval = 0.15,
		directDamage = 40, directRange = 8.2, directAngle = 130, waveDamage = 30, waveSpeed = 83.2,
		attackLock = 0.25, iaijutsuCooldown = 3, iaijutsuCharge = 1, iaijutsuDamage = 80,
		iaijutsuRange = 15, iaijutsuWidth = 4, vfx = "slash",
	},
	sniper = { cooldown = 2, teleportCooldown = 2 }, -- F: instakill shot, R: random teleport
	magicstaff = { cooldown = 2 }, -- F: fireball; LMB: targeted ice shards
}

WeaponConfig.AltSkill = {
	sword = { cooldown = 5, hitType = "circle", vfx = "slash", damage = 22, range = 6.8 },
	axe = { cooldown = 5.8, hitType = "circle", vfx = "slash", damage = 34, range = 8.5 },
	bow = { cooldown = 4, hitType = "line", damage = 40, range = WeaponConfig.REACH, width = 0.8 },
	spear = { cooldown = 4, hitType = "line", damage = 28, range = 18, width = 1.6 },
	gauntlet = { cooldown = 4.5, hitType = "circle", vfx = "punch", damage = 22, range = 6.5 },
	greatsword = { cooldown = 5, hitType = "circle", vfx = "slash", damage = 24, range = 7.2 },
	scythe = { cooldown = 5, hitType = "sweet_arc", damage = 22, sweetDamage = 36, range = 11, innerRange = 5.2, angle = 210 },
	dagger = { cooldown = 4.5, hitType = "line", damage = 26, range = 9, width = 0.7 },
	rapier = { cooldown = 4, hitType = "precise_line", damage = 32, range = 13, width = 0.5 },
	hammer = { cooldown = 6, hitType = "circle", damage = 26, range = 8 },
	matchlock = { cooldown = 6, hitType = "line", damage = 60, range = WeaponConfig.REACH, width = 0.65 },
}

-- Automatic-attack combos (finisher every `cycle` hits).
WeaponConfig.Combo = {
	sword = {
		cycle = 4, delayAfterStep = 3, delayBeforeFinisher = 0.88, comboReset = 2.6,
		finisher = { hitType = "arc", damage = 28, range = 7.8, angle = 360, cooldown = 0.76 },
	},
	axe = {
		cycle = 3, delayAfterStep = 2, delayBeforeFinisher = 1.28, comboReset = 2.8,
		finisher = { hitType = "circle", damage = 64, range = 9.2, angle = 360, cooldown = 1.12 },
	},
	spear = {
		cycle = 5, comboReset = 1.8,
		finisher = { hitType = "line", range = 15.5, width = 1.8, damage = 20, cooldown = 0.56 },
	},
	gauntlet = {
		cycle = 7, comboReset = 0.95,
		finisher = { hitType = "line", range = 11.8, width = 2.4, damage = 28, cooldown = 0.24 },
	},
	greatsword = {
		cycle = 3, delayAfterStep = 2, delayBeforeFinisher = 0.62, comboReset = 2.4,
		finisher = { hitType = "projectile", damage = 25, range = 18.5, speed = 76, radius = 2.8, cooldown = 0.76 },
	},
	scythe = {
		cycle = 3, comboReset = 2.1,
		finisher = { hitType = "sweet_arc", damage = 24, sweetDamage = 44, range = 11.8, innerRange = 5.6, angle = 210, pull = 4.2, cooldown = 0.78 },
	},
	rapier = {
		cycle = 5, comboReset = 1.8,
		finisher = { hitType = "precise_line", range = 13, width = 0.6, damage = 24, critDamage = 36, knockback = 3, cooldown = 0.43 },
	},
	katana = {
		cycle = 4, delayAfterStep = 3, delayBeforeFinisher = 0.76, comboReset = 2.6,
		finisher = { hitType = "arc", damage = 28, range = 7.8, angle = 360, cooldown = 0.6 },
	},
}

-- Magic staff spells (auto-cast rolls one of these in the web build).
WeaponConfig.Magic = {
	cooldown = 2,
	fireball  = { cooldown = 2, damage = 40, speed = 54, radius = 0.9, burnDps = 2, burnDuration = 4 },
	iceShard  = { cooldown = 2, count = 4, damage = 12, speed = 74, radius = 0.6, interval = 0.12 },
	lifebound = { cooldown = 2, heal = 30 },
}

function WeaponConfig.getWeapon(weaponId: string?)
	return WeaponConfig.Weapons[weaponId or WeaponConfig.DefaultWeapon]
		or WeaponConfig.Weapons[WeaponConfig.DefaultWeapon]
end

-- Effective stats while a skill buff is active: 'axe_rage' | 'gauntlet_lance' | 'rapier_riposte'.
function WeaponConfig.getEffectiveWeapon(weaponId: string, buffType: string?)
	local base = WeaponConfig.getWeapon(weaponId)
	if not buffType then
		return base
	end

	local merged = table.clone(base)
	if buffType == "axe_rage" and weaponId == "axe" then
		local sk = WeaponConfig.Skill.axe
		merged.hitType = sk.hitType
		merged.damage = sk.damage
		merged.cooldown = sk.attackCooldown
		merged.range = sk.range
		merged.angle = sk.angle
		merged.vfx = sk.vfx or merged.vfx
	elseif buffType == "gauntlet_lance" and weaponId == "gauntlet" then
		local sk = WeaponConfig.Skill.gauntlet
		merged.hitType = sk.hitType
		merged.damage = sk.damage
		merged.range = sk.range
		merged.width = sk.width
		merged.vfx = sk.vfx or merged.vfx
	elseif buffType == "rapier_riposte" and weaponId == "rapier" then
		local sk = WeaponConfig.Skill.rapier
		merged.cooldown = sk.buffCooldown
		merged.range = sk.buffRange
		merged.width = sk.buffWidth
		merged.hitCooldownRefund = sk.buffHitRefund
		merged.missPenalty = 0
	end
	return merged
end

return WeaponConfig
