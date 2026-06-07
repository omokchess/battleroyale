local Debris = game:GetService("Debris")

local EffectsClient = {}

local EFFECT_HEIGHT = 0.26

local function withHeight(point: Vector3): Vector3
	return Vector3.new(point.X, EFFECT_HEIGHT, point.Z)
end

local function makePart(startPoint: Vector3, endPoint: Vector3, width: number, color: Color3, life: number, transparency: number?)
	local offset = endPoint - startPoint
	local length = offset.Magnitude
	if length <= 0.05 then
		return
	end

	local part = Instance.new("Part")
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CastShadow = false
	part.Material = Enum.Material.Neon
	part.Color = color
	part.Transparency = transparency or 0.35
	part.Size = Vector3.new(width, 0.14, length)
	part.CFrame = CFrame.lookAt((startPoint + endPoint) * 0.5, endPoint)
	part.Parent = workspace
	Debris:AddItem(part, life)
end

local function makeDisc(position: Vector3, size: Vector3, color: Color3, life: number, transparency: number)
	local part = Instance.new("Part")
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CastShadow = false
	part.Material = Enum.Material.Neon
	part.Color = color
	part.Transparency = transparency
	part.Size = size
	part.CFrame = CFrame.new(withHeight(position))
	part.Parent = workspace
	Debris:AddItem(part, life)
end

local function rotateFlat(direction: Vector3, radians: number): Vector3
	local cos = math.cos(radians)
	local sin = math.sin(radians)
	return Vector3.new(
		direction.X * cos - direction.Z * sin,
		0,
		direction.X * sin + direction.Z * cos
	).Unit
end

function EffectsClient.drawCircle(payload)
	local origin = payload.origin
	local range = payload.range or 6
	local color = payload.color or Color3.fromRGB(69, 243, 255)
	local life = payload.life or 0.14
	local segments = 24

	makeDisc(origin, Vector3.new(range * 1.35, 0.08, range * 1.35), color, life, 0.88)

	for i = 1, segments do
		local a0 = (i - 1) / segments * math.pi * 2
		local a1 = i / segments * math.pi * 2
		local p0 = withHeight(origin + Vector3.new(math.cos(a0) * range, 0, math.sin(a0) * range))
		local p1 = withHeight(origin + Vector3.new(math.cos(a1) * range, 0, math.sin(a1) * range))
		makePart(p0, p1, 0.22, color, life, 0.24)
	end
end

function EffectsClient.drawLine(payload)
	local origin = withHeight(payload.origin)
	local direction = payload.direction
	local range = payload.range or 6
	local color = payload.color or Color3.fromRGB(69, 243, 255)
	local width = payload.width or 0.3
	local life = payload.life or 0.13

	makePart(origin, origin + direction * range, math.max(width, 0.18), color, life, 0.25)
	makePart(origin, origin + direction * range * 0.92, 0.08, Color3.fromRGB(255, 255, 255), life, 0.08)
end

function EffectsClient.drawArc(payload)
	local origin = payload.origin
	local direction = payload.direction
	local range = payload.range or 6
	local color = payload.color or Color3.fromRGB(69, 243, 255)
	local angle = math.rad(payload.angle or 100)
	local life = payload.life or 0.14
	local rays = 11

	for i = 0, rays - 1 do
		local t = if rays == 1 then 0 else i / (rays - 1)
		local offset = (t - 0.5) * angle
		local dir = rotateFlat(direction, offset)
		local width = if i == 0 or i == rays - 1 then 0.16 else 0.1
		makePart(withHeight(origin), withHeight(origin + dir * range), width, color, life, 0.45)
	end

	local arcSegments = 10
	for i = 1, arcSegments do
		local t0 = (i - 1) / arcSegments
		local t1 = i / arcSegments
		local a0 = (t0 - 0.5) * angle
		local a1 = (t1 - 0.5) * angle
		local p0 = withHeight(origin + rotateFlat(direction, a0) * range)
		local p1 = withHeight(origin + rotateFlat(direction, a1) * range)
		makePart(p0, p1, 0.2, color, life, 0.18)
	end
end

function EffectsClient.drawAttackEffect(payload)
	if typeof(payload) ~= "table" then
		return
	end

	if payload.hitType == "circle" then
		EffectsClient.drawCircle(payload)
	elseif payload.hitType == "line" then
		EffectsClient.drawLine(payload)
	else
		EffectsClient.drawArc(payload)
	end
end

return EffectsClient

