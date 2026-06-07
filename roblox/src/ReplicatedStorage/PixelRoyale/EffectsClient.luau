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

-- Web-style slash: a faint cone + a bright crescent that sweeps edge-to-edge
-- with a glowing white leading tip.
function EffectsClient.drawArc(payload)
	local origin = payload.origin
	local direction = payload.direction or Vector3.new(0, 0, -1)
	local range = payload.range or 6
	local color = payload.color or Color3.fromRGB(69, 243, 255)
	local half = math.rad(payload.angle or 100) * 0.5
	local life = payload.life or 0.22
	local aim = math.atan2(direction.Z, direction.X)
	local swing = if payload.swingDirection == -1 then -1 else 1

	-- faint cone fill (radial slices)
	local coneSegs = 8
	for i = 0, coneSegs - 1 do
		local mid = aim - half + (2 * half) * ((i + 0.5) / coneSegs)
		makePart(
			withHeight(origin),
			withHeight(origin + Vector3.new(math.cos(mid), 0, math.sin(mid)) * range),
			(2 * half * range) / coneSegs + 0.1, color, life * 0.7, 0.82
		)
	end

	-- bright crescent at the outer edge, lit up segment-by-segment to sweep
	local segs = 12
	local r = range * 0.92
	local function angAt(t)
		return if swing > 0 then aim - half + 2 * half * t else aim + half - 2 * half * t
	end
	for i = 0, segs - 1 do
		local a0, a1 = angAt(i / segs), angAt((i + 1) / segs)
		local p0 = withHeight(origin + Vector3.new(math.cos(a0), 0, math.sin(a0)) * r)
		local p1 = withHeight(origin + Vector3.new(math.cos(a1), 0, math.sin(a1)) * r)
		task.delay(i * 0.012, function()
			makePart(p0, p1, 0.55, color, life * 0.85, 0.12)
			makePart(p0, p1, 0.22, Color3.fromRGB(255, 255, 255), life * 0.55, 0.04)
		end)
	end
end

-- Map every weapon hitType onto the matching visual (mirrors HitboxUtil).
local SHAPE = {
	circle = "circle", slam = "circle",
	line = "line", precise_line = "line", projectile = "line",
	arc = "arc", sweet_arc = "arc", blade_sweep = "arc",
}

-- White spark + radial spokes at a contact point.
function EffectsClient.drawHitSpark(position: Vector3, color: Color3?)
	if typeof(position) ~= "Vector3" then
		return
	end
	makeBlock(position, Vector3.new(1.7, 0.16, 1.7), Color3.fromRGB(255, 255, 255), 0.22, 0.05)
	for i = 0, 5 do
		local a = i / 6 * math.pi * 2
		local dir = Vector3.new(math.cos(a), 0, math.sin(a))
		makePart(withHeight(position + dir * 0.2), withHeight(position + dir * 1.7), 0.16, color or Color3.fromRGB(255, 220, 120), 0.22, 0.18)
	end
end

-- Expanding ring + flash where a player dashed.
function EffectsClient.drawDash(position: Vector3, color: Color3?)
	if typeof(position) ~= "Vector3" then
		return
	end
	color = color or Color3.fromRGB(180, 240, 255)
	makeBlock(position, Vector3.new(2.4, 0.18, 2.4), Color3.fromRGB(255, 255, 255), 0.26, 0.1)
	local segments = 26
	local r = 2.7
	for i = 1, segments do
		local a0 = (i - 1) / segments * math.pi * 2
		local a1 = i / segments * math.pi * 2
		local p0 = withHeight(position + Vector3.new(math.cos(a0) * r, 0, math.sin(a0) * r))
		local p1 = withHeight(position + Vector3.new(math.cos(a1) * r, 0, math.sin(a1) * r))
		makePart(p0, p1, 0.18, color, 0.3, 0.25)
	end
end

-- Glowing pad welded under a buffed player; follows them for the buff duration.
function EffectsClient.drawBuff(root: BasePart?, color: Color3?, duration: number?)
	if not root or not root:IsA("BasePart") then
		return
	end
	local life = duration or 4
	local pad = Instance.new("Part")
	pad.Size = Vector3.new(5.6, 0.14, 5.6)
	pad.Anchored = false
	pad.CanCollide = false
	pad.CanQuery = false
	pad.CanTouch = false
	pad.CastShadow = false
	pad.Material = Enum.Material.Neon
	pad.Color = color or Color3.fromRGB(255, 220, 120)
	pad.Transparency = 0.58
	pad.CFrame = root.CFrame * CFrame.new(0, -2.4, 0)
	pad.Parent = getFolder()
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = pad
	weld.Part1 = root
	weld.Parent = pad
	task.delay(math.max(life - 0.45, 0), function()
		if pad.Parent then
			TweenService:Create(pad, TweenInfo.new(0.45), { Transparency = 1 }):Play()
		end
	end)
	Debris:AddItem(pad, life + 0.1)
end

-- A neon ball flying along the shot trajectory (visual only; server owns hits).
function EffectsClient.drawProjectile(payload)
	if typeof(payload) ~= "table" or typeof(payload.origin) ~= "Vector3" then
		return
	end
	local speed = payload.speed or 60
	local range = payload.range or 30
	local life = math.clamp(range / math.max(speed, 1), 0.1, 2.2)
	local origin = withHeight(payload.origin)
	local dir = (payload.direction or Vector3.new(0, 0, -1))
	local color = payload.color or Color3.fromRGB(120, 220, 255)
	local d = (payload.radius or 0.6) * 2 + 0.7
	local ball = Instance.new("Part")
	ball.Shape = Enum.PartType.Ball
	configure(ball, color, 0.05)
	ball.Size = Vector3.new(d, d, d)
	ball.CFrame = CFrame.lookAt(origin, origin + dir)

	-- neon trail (attachments offset along RightVector so it reads from top-down)
	local a0 = Instance.new("Attachment"); a0.Position = Vector3.new(0.5, 0, 0); a0.Parent = ball
	local a1 = Instance.new("Attachment"); a1.Position = Vector3.new(-0.5, 0, 0); a1.Parent = ball
	local trail = Instance.new("Trail")
	trail.Attachment0 = a0
	trail.Attachment1 = a1
	trail.Lifetime = 0.2
	trail.LightEmission = 1
	trail.Color = ColorSequence.new(color)
	trail.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.1), NumberSequenceKeypoint.new(1, 1) })
	trail.WidthScale = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(1, 0) })
	trail.Parent = ball

	local endPos = origin + dir * range
	TweenService:Create(ball, TweenInfo.new(life, Enum.EasingStyle.Linear), { CFrame = CFrame.lookAt(endPos, endPos + dir) }):Play()
	Debris:AddItem(ball, life + 0.05)
end

function EffectsClient.drawAttackEffect(payload)
	if typeof(payload) ~= "table" then
		return
	end

	local shape = SHAPE[payload.hitType] or "arc"
	if shape == "circle" then
		EffectsClient.drawCircle(payload)
	elseif shape == "line" then
		EffectsClient.drawLine(payload)
	else
		EffectsClient.drawArc(payload)
	end

	-- Finisher pop.
	if payload.isFinisher and payload.origin then
		makeBlock(payload.origin, Vector3.new(2.2, 0.2, 2.2), Color3.fromRGB(255, 255, 255), 0.26, 0.05)
	end

	-- Contact sparks at each hit the server reported.
	if typeof(payload.hits) == "table" then
		for _, pos in ipairs(payload.hits) do
			EffectsClient.drawHitSpark(pos, payload.color)
		end
	end
end

return EffectsClient
