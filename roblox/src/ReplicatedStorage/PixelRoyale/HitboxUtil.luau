local HitboxUtil = {}

local EPSILON = 0.001

function HitboxUtil.flat(vector: Vector3): Vector3
	return Vector3.new(vector.X, 0, vector.Z)
end

function HitboxUtil.safeUnit(vector: Vector3, fallback: Vector3?): Vector3
	local flat = HitboxUtil.flat(vector)
	if flat.Magnitude <= EPSILON then
		return fallback or Vector3.new(0, 0, -1)
	end
	return flat.Unit
end

function HitboxUtil.isInCircle(origin: Vector3, target: Vector3, range: number): boolean
	return HitboxUtil.flat(target - origin).Magnitude <= range
end

function HitboxUtil.isInArc(origin: Vector3, direction: Vector3, target: Vector3, range: number, angleDegrees: number): boolean
	local offset = HitboxUtil.flat(target - origin)
	local distance = offset.Magnitude
	if distance <= EPSILON or distance > range then
		return false
	end

	local dot = math.clamp(direction:Dot(offset.Unit), -1, 1)
	local angle = math.deg(math.acos(dot))
	return angle <= angleDegrees * 0.5
end

function HitboxUtil.isInLine(origin: Vector3, direction: Vector3, target: Vector3, range: number, width: number): boolean
	local offset = HitboxUtil.flat(target - origin)
	local along = offset:Dot(direction)
	if along < 0 or along > range then
		return false
	end

	local closest = direction * along
	local perpendicular = (offset - closest).Magnitude
	return perpendicular <= math.max(width * 0.5, 0.1)
end

-- Map every weapon hitType onto one of the three primitive shapes. The richer
-- nuances (scythe sweet/inner ring, precise-line crits, hammer slam delay,
-- blade-sweep band) are resolved by the combat layer; geometry-wise they reduce
-- to circle / line / arc.
local HIT_SHAPE = {
	circle = "circle", slam = "circle",
	line = "line", precise_line = "line", projectile = "line",
	arc = "arc", sweet_arc = "arc", blade_sweep = "arc",
}

function HitboxUtil.check(origin: Vector3, direction: Vector3, target: Vector3, weapon): boolean
	local shape = HIT_SHAPE[weapon.hitType] or "arc"
	if shape == "circle" then
		return HitboxUtil.isInCircle(origin, target, weapon.range)
	elseif shape == "line" then
		return HitboxUtil.isInLine(origin, direction, target, weapon.range, weapon.width or 1)
	end

	return HitboxUtil.isInArc(origin, direction, target, weapon.range, weapon.angle or 90)
end

return HitboxUtil

