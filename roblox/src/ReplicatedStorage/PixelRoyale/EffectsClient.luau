local Debris = game:GetService("Debris")
local TweenService = game:GetService("TweenService")

local EffectsClient = {}

local EFFECT_HEIGHT = 0.36
local FOLDER_NAME = "_PixelRoyaleEffects"

local folder: Folder? = nil

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

local function withHeight(point: Vector3): Vector3
	return Vector3.new(point.X, EFFECT_HEIGHT, point.Z)
end

local function fade(part: BasePart, life: number)
	local tween = TweenService:Create(
		part,
		TweenInfo.new(life, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		{ Transparency = 1 }
	)
	tween:Play()
	Debris:AddItem(part, life + 0.08)
end

local function configure(part: BasePart, color: Color3, transparency: number)
	part.Anchored = true
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.CastShadow = false
	part.Material = Enum.Material.Neon
	part.Color = color
	part.Transparency = transparency
	part.Parent = getFolder()
end

local function makePart(startPoint: Vector3, endPoint: Vector3, width: number, color: Color3, life: number, transparency: number?)
	local offset = endPoint - startPoint
	local length = offset.Magnitude
	if length <= 0.05 then
		return
	end

	local part = Instance.new("Part")
	configure(part, color, transparency or 0.32)
	part.Size = Vector3.new(width, 0.14, length)
	part.CFrame = CFrame.lookAt((startPoint + endPoint) * 0.5, endPoint)
	fade(part, life)
end

local function makeBlock(position: Vector3, size: Vector3, color: Color3, life: number, transparency: number)
	local part = Instance.new("Part")
	configure(part, color, transparency)
	part.Size = size
	part.CFrame = CFrame.new(withHeight(position))
	fade(part, life)
end

local function rotateFlat(direction: Vector3, radians: number): Vector3
	local cos = math.cos(radians)
	local sin = math.sin(radians)
	local rotated = Vector3.new(
		direction.X * cos - direction.Z * sin,
		0,
		direction.X * sin + direction.Z * cos
	)
	if rotated.Magnitude <= 0.01 then
		return Vector3.new(0, 0, -1)
	end
	return rotated.Unit
end

function EffectsClient.drawCircle(payload)
	local origin = payload.origin
	local range = payload.range or 6
	local color = payload.color or Color3.fromRGB(69, 243, 255)
	local life = payload.life or 0.22
	local segments = 34

	makeBlock(origin, Vector3.new(range * 1.5, 0.08, range * 1.5), color, life, 0.9)

	for ring = 1, 3 do
		local radius = range * (0.48 + ring * 0.18)
		for i = 1, segments do
			local a0 = (i - 1) / segments * math.pi * 2
			local a1 = i / segments * math.pi * 2
			local p0 = withHeight(origin + Vector3.new(math.cos(a0) * radius, 0, math.sin(a0) * radius))
			local p1 = withHeight(origin + Vector3.new(math.cos(a1) * radius, 0, math.sin(a1) * radius))
			makePart(p0, p1, 0.2, ring == 3 and Color3.fromRGB(255, 255, 255) or color, life, ring == 3 and 0.12 or 0.38)
		end
	end

	for i = 0, 11 do
		local angle = i / 12 * math.pi * 2
		local direction = Vector3.new(math.cos(angle), 0, math.sin(angle))
		makePart(withHeight(origin + direction * range * 0.2), withHeight(origin + direction * range), 0.12, color, life, 0.55)
	end
end

function EffectsClient.drawLine(payload)
	local origin = withHeight(payload.origin)
	local direction = payload.direction
	local range = payload.range or 6
	local color = payload.color or Color3.fromRGB(69, 243, 255)
	local width = payload.width or 0.3
	local life = payload.life or 0.18
	local endPoint = origin + direction * range

	makePart(origin, endPoint, math.max(width * 1.7, 0.3), color, life, 0.38)
	makePart(origin, origin + direction * range * 0.94, math.max(width * 0.55, 0.08), Color3.fromRGB(255, 255, 255), life, 0.06)
	makeBlock(endPoint, Vector3.new(0.9, 0.12, 0.9), Color3.fromRGB(255, 255, 255), life, 0.2)
end

function EffectsClient.drawArc(payload)
	local origin = payload.origin
	local direction = payload.direction
	local range = payload.range or 6
	local color = payload.color or Color3.fromRGB(69, 243, 255)
	local angle = math.rad(payload.angle or 100)
	local life = payload.life or 0.2
	local rays = 17

	for i = 0, rays - 1 do
		local t = i / (rays - 1)
		local offset = (t - 0.5) * angle
		local dir = rotateFlat(direction, offset)
		local inner = range * 0.12
		local outer = range * (0.72 + 0.22 * math.sin(t * math.pi))
		makePart(withHeight(origin + dir * inner), withHeight(origin + dir * outer), 0.1, color, life, 0.72)
	end

	for layer = 1, 4 do
		local radius = range * (0.34 + layer * 0.17)
		local arcSegments = 18
		for i = 1, arcSegments do
			local t0 = (i - 1) / arcSegments
			local t1 = i / arcSegments
			local a0 = (t0 - 0.5) * angle
			local a1 = (t1 - 0.5) * angle
			local p0 = withHeight(origin + rotateFlat(direction, a0) * radius)
			local p1 = withHeight(origin + rotateFlat(direction, a1) * radius)
			local slashColor = layer == 4 and Color3.fromRGB(255, 255, 255) or color
			local slashWidth = layer == 4 and 0.26 or 0.16
			local slashAlpha = layer == 4 and 0.08 or 0.32
			makePart(p0, p1, slashWidth, slashColor, life, slashAlpha)
		end
	end

	local left = rotateFlat(direction, -angle * 0.5)
	local right = rotateFlat(direction, angle * 0.5)
	makePart(withHeight(origin + left * range * 0.2), withHeight(origin + left * range), 0.18, color, life, 0.35)
	makePart(withHeight(origin + right * range * 0.2), withHeight(origin + right * range), 0.18, color, life, 0.35)
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
