local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local EffectsClient = {}

local EFFECT_HEIGHT = 0.36
local FOLDER_NAME = "_PixelRoyaleEffects"
local PREVIEW_FOLDER_NAME = "_PixelRoyalePreview"
local CHARGE_FOLDER_NAME = "_PixelRoyaleChargePreview"
local QTE_FOLDER_NAME = "_PixelRoyaleQTE"
local AIM_FOLDER_NAME = "_PixelRoyaleAimCrosshair"

local folder: Folder? = nil
local previewFolder: Folder? = nil
local chargeFolder: Folder? = nil
local qteFolder: Folder? = nil
local aimFolder: Folder? = nil

local function rootOfUser(userId: number?): BasePart?
	local player = userId and Players:GetPlayerByUserId(userId)
	local character = player and player.Character
	return character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
end

local function aimOfUser(userId: number?, fallback: Vector3?): Vector3
	local player = userId and Players:GetPlayerByUserId(userId)
	if player then
		local x = player:GetAttribute("AimX")
		local z = player:GetAttribute("AimZ")
		if typeof(x) == "number" and typeof(z) == "number" then
			local dir = Vector3.new(x, 0, z)
			if dir.Magnitude > 0.01 then
				return dir.Unit
			end
		end
	end
	return fallback or Vector3.new(0, 0, -1)
end

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

local function getNamedFolder(name: string, current: Folder?): Folder
	if current and current.Parent then
		return current
	end

	local existing = workspace:FindFirstChild(name)
	if existing and existing:IsA("Folder") then
		return existing
	end

	local created = Instance.new("Folder")
	created.Name = name
	created.Parent = workspace
	return created
end

local function clearFolder(target: Folder?)
	if not target then
		return
	end
	for _, child in ipairs(target:GetChildren()) do
		child:Destroy()
	end
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

local function configureStatic(part: BasePart, color: Color3, transparency: number, parent: Folder)
	part.Anchored = true
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.CastShadow = false
	part.Material = Enum.Material.Neon
	part.Color = color
	part.Transparency = transparency
	part.Parent = parent
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

local function makeMovingLine(startPoint: Vector3, endPoint: Vector3, width: number, color: Color3, life: number, transparency: number, move: Vector3)
	local offset = endPoint - startPoint
	local length = offset.Magnitude
	if length <= 0.05 then
		return
	end

	local part = Instance.new("Part")
	configure(part, color, transparency)
	part.Size = Vector3.new(width, 0.14, length)
	part.CFrame = CFrame.lookAt((startPoint + endPoint) * 0.5, endPoint)
	TweenService:Create(part, TweenInfo.new(life, Enum.EasingStyle.Linear), { CFrame = part.CFrame + move }):Play()
	fade(part, life)
end

local function makeStaticLine(parent: Folder, startPoint: Vector3, endPoint: Vector3, width: number, color: Color3, transparency: number)
	local offset = endPoint - startPoint
	local length = offset.Magnitude
	if length <= 0.05 then
		return
	end

	local part = Instance.new("Part")
	configureStatic(part, color, transparency, parent)
	part.Size = Vector3.new(width, 0.08, length)
	part.CFrame = CFrame.lookAt((startPoint + endPoint) * 0.5, endPoint)
end

local function makeStaticBlock(parent: Folder, position: Vector3, size: Vector3, color: Color3, transparency: number)
	local part = Instance.new("Part")
	configureStatic(part, color, transparency, parent)
	part.Size = size
	part.CFrame = CFrame.new(withHeight(position))
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

-- Bold, solid, weapon-coloured range previews (filled zone + thick outline) so
-- the attack area reads clearly from the top-down camera.
local function drawPreviewCircle(parent: Folder, origin: Vector3, range: number, color: Color3, transparency: number)
	-- faint filled disc
	local fill = Instance.new("Part")
	fill.Shape = Enum.PartType.Cylinder
	configureStatic(fill, color, math.min(transparency + 0.18, 0.93), parent)
	fill.Size = Vector3.new(0.08, range * 2, range * 2)
	fill.CFrame = CFrame.new(withHeight(origin)) * CFrame.Angles(0, 0, math.rad(90))
	-- bold ring
	local segments = 52
	for i = 1, segments do
		local a0 = (i - 1) / segments * math.pi * 2
		local a1 = i / segments * math.pi * 2
		local p0 = withHeight(origin + Vector3.new(math.cos(a0) * range, 0, math.sin(a0) * range))
		local p1 = withHeight(origin + Vector3.new(math.cos(a1) * range, 0, math.sin(a1) * range))
		makeStaticLine(parent, p0, p1, 0.38, color, transparency)
	end
end

local function drawPreviewLine(parent: Folder, origin: Vector3, direction: Vector3, range: number, width: number, color: Color3, transparency: number)
	local mid = withHeight(origin + direction * (range * 0.5))
	-- faint filled band
	local fill = Instance.new("Part")
	configureStatic(fill, color, math.min(transparency + 0.18, 0.93), parent)
	fill.Size = Vector3.new(math.max(width * 2, 0.7), 0.08, range)
	fill.CFrame = CFrame.lookAt(mid, withHeight(origin + direction * range))
	-- bold centre line + end cap
	makeStaticLine(parent, withHeight(origin), withHeight(origin + direction * range), math.max(width, 0.42), color, transparency)
	makeStaticBlock(parent, origin + direction * range, Vector3.new(1.1, 0.08, 1.1), color, transparency)
end

local function drawPreviewArc(parent: Folder, origin: Vector3, direction: Vector3, range: number, angle: number, color: Color3, transparency: number)
	local half = math.rad(angle) * 0.5
	local segments = 28
	-- faint filled cone (radial slices)
	for i = 0, segments - 1 do
		local mid = -half + (i + 0.5) / segments * half * 2
		local d = rotateFlat(direction, mid)
		makeStaticLine(parent, withHeight(origin), withHeight(origin + d * range), (range * half * 2) / segments + 0.12, color, math.min(transparency + 0.18, 0.93))
	end
	-- bold outline: edges + outer arc
	makeStaticLine(parent, withHeight(origin), withHeight(origin + rotateFlat(direction, -half) * range), 0.34, color, transparency)
	makeStaticLine(parent, withHeight(origin), withHeight(origin + rotateFlat(direction, half) * range), 0.34, color, transparency)
	for i = 1, segments do
		local a0 = -half + (i - 1) / segments * half * 2
		local a1 = -half + i / segments * half * 2
		local p0 = withHeight(origin + rotateFlat(direction, a0) * range)
		local p1 = withHeight(origin + rotateFlat(direction, a1) * range)
		makeStaticLine(parent, p0, p1, 0.34, color, transparency)
	end
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

function EffectsClient.drawPunch(payload)
	local origin = payload.origin
	local direction = payload.direction or Vector3.new(0, 0, -1)
	local range = payload.range or 5
	local color = payload.color or Color3.fromRGB(255, 69, 219)
	local life = payload.life or 0.14
	local center = withHeight(origin + direction * (range * 0.45))

	makePart(withHeight(origin + direction * 0.5), withHeight(origin + direction * range), 0.72, color, life, 0.22)
	makePart(withHeight(origin + direction * 0.8), withHeight(origin + direction * range * 0.75), 0.22, Color3.fromRGB(255, 255, 255), life, 0.06)
	makeBlock(origin + direction * range, Vector3.new(1.2, 0.16, 1.2), Color3.fromRGB(255, 255, 255), life, 0.12)

	for i = -2, 2 do
		local offset = i * 0.28
		local side = rotateFlat(direction, math.rad(90))
		makePart(center + side * offset, center + side * offset + direction * 1.8, 0.14, color, life, 0.35)
	end
end

-- Web-style slash: faint fan fill + bright blade route + white leading edge.
function EffectsClient.drawArc(payload)
	local origin = payload.origin
	local direction = payload.direction or Vector3.new(0, 0, -1)
	local range = payload.range or 6
	local color = payload.color or Color3.fromRGB(69, 243, 255)
	local half = math.rad(payload.angle or 100) * 0.5
	local life = payload.life or 0.22
	local aim = math.atan2(direction.Z, direction.X)
	local swing = if payload.swingDirection == -1 then -1 else 1
	local fullCircle = (payload.angle or 0) >= 359
	local startAngle = if fullCircle and payload.weaponId == "sword" then aim - math.pi * 0.75 else aim - half
	local endAngle = if fullCircle then startAngle + math.pi * 2 else aim + half
	local arcSize = endAngle - startAngle
	local function angAt(t)
		return if swing > 0 then startAngle + arcSize * t else endAngle - arcSize * t
	end

	local coneSegs = 10
	for i = 0, coneSegs - 1 do
		local mid = startAngle + arcSize * ((i + 0.5) / coneSegs)
		local dir = Vector3.new(math.cos(mid), 0, math.sin(mid))
		makePart(
			withHeight(origin + dir * (range * 0.08)),
			withHeight(origin + dir * range),
			(math.abs(arcSize) * range) / coneSegs + 0.08,
			color,
			life * 0.72,
			0.88
		)
	end

	-- one clean crescent at the outer edge (weapon colour + bright white core),
	-- instead of stacked concentric bands — reads as a single crisp slash.
	local segs = if fullCircle then 30 else 16
	local r = range * 0.9
	for i = 0, segs - 1 do
		local a0 = angAt(i / segs)
		local a1 = angAt((i + 1) / segs)
		local p0 = withHeight(origin + Vector3.new(math.cos(a0), 0, math.sin(a0)) * r)
		local p1 = withHeight(origin + Vector3.new(math.cos(a1), 0, math.sin(a1)) * r)
		makePart(p0, p1, 0.55, color, life * 0.9, 0.12)
		makePart(p0, p1, 0.2, Color3.fromRGB(255, 255, 255), life * 0.55, 0.06)
	end

	local tipAngle = angAt(1)
	local normal = rotateFlat(Vector3.new(math.cos(tipAngle), 0, math.sin(tipAngle)), math.rad(90) * swing)
	local edgeDir = Vector3.new(math.cos(tipAngle), 0, math.sin(tipAngle))
	local bladeStart = withHeight(origin + edgeDir * math.max(0.7, range * 0.08))
	local bladeEnd = withHeight(origin + edgeDir * range)
	makePart(bladeStart, bladeEnd, 1.0, color, life, 0.3)
	makePart(bladeStart, bladeEnd, 0.42, Color3.fromRGB(255, 255, 255), life * 0.86, 0.04)
	makePart(bladeEnd - normal * 0.7, bladeEnd + normal * 0.7, 0.22, Color3.fromRGB(255, 255, 255), life * 0.72, 0.08)
	makeBlock(origin + edgeDir * range, Vector3.new(0.95, 0.14, 0.95), Color3.fromRGB(255, 255, 255), life * 0.72, 0.08)
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
		makePart(withHeight(position + dir * 0.2), withHeight(position + dir * 1.7), 0.16, color or Color3.fromRGB(69, 243, 255), 0.22, 0.18)
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
	pad.Color = color or Color3.fromRGB(69, 243, 255)
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

local function drawMovingNeedle(origin: Vector3, dir: Vector3, range: number, speed: number, color: Color3, width: number, length: number)
	local life = math.clamp(range / math.max(speed, 1), 0.12, 2.2)
	local move = dir * range
	local startPoint = origin + dir * 0.8
	local endPoint = origin + dir * length
	makeMovingLine(startPoint, endPoint, width * 1.8, color, life, 0.3, move)
	makeMovingLine(startPoint, endPoint, width * 0.52, Color3.fromRGB(255, 255, 255), life, 0.04, move)

	local side = rotateFlat(dir, math.rad(90))
	makeMovingLine(origin - side * width * 1.3, origin - side * width * 0.15 + dir * 1.4, width * 0.35, color, life * 0.82, 0.42, move)
	makeMovingLine(origin + side * width * 1.3, origin + side * width * 0.15 + dir * 1.4, width * 0.35, color, life * 0.82, 0.42, move)
end

local function drawMovingBladeWave(origin: Vector3, dir: Vector3, range: number, speed: number, color: Color3)
	local life = math.clamp(range / math.max(speed, 1), 0.16, 2.2)
	local side = rotateFlat(dir, math.rad(90))
	local move = dir * range
	local bladeWidth = 4.4
	local points = {}

	for i = 0, 8 do
		local t = -1 + (i / 8) * 2
		local curve = 1.1 + (1 - math.abs(t)) * 1.75
		table.insert(points, origin + dir * curve + side * (t * bladeWidth))
	end

	for i = 1, #points - 1 do
		local p0 = withHeight(points[i])
		local p1 = withHeight(points[i + 1])
		makeMovingLine(p0, p1, 0.78, color, life, 0.2, move)
		makeMovingLine(p0, p1, 0.24, Color3.fromRGB(255, 255, 255), life * 0.85, 0.03, move)
	end

	makeMovingLine(withHeight(origin - side * 2.4), withHeight(origin + side * 2.4), 0.18, Color3.fromRGB(255, 255, 255), life * 0.55, 0.08, move)
end

local function drawMovingOrb(origin: Vector3, dir: Vector3, range: number, speed: number, color: Color3, radius: number)
	local life = math.clamp(range / math.max(speed, 1), 0.1, 2.2)
	local d = radius * 2 + 0.7
	local ball = Instance.new("Part")
	ball.Shape = Enum.PartType.Ball
	configure(ball, color, 0.05)
	ball.Size = Vector3.new(d, d, d)
	ball.CFrame = CFrame.lookAt(origin, origin + dir)

	local a0 = Instance.new("Attachment")
	a0.Position = Vector3.new(0.5, 0, 0)
	a0.Parent = ball
	local a1 = Instance.new("Attachment")
	a1.Position = Vector3.new(-0.5, 0, 0)
	a1.Parent = ball
	local trail = Instance.new("Trail")
	trail.Attachment0 = a0
	trail.Attachment1 = a1
	trail.Lifetime = 0.22
	trail.LightEmission = 1
	trail.Color = ColorSequence.new(color)
	trail.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.06), NumberSequenceKeypoint.new(1, 1) })
	trail.WidthScale = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(1, 0) })
	trail.Parent = ball

	local endPos = origin + dir * range
	TweenService:Create(ball, TweenInfo.new(life, Enum.EasingStyle.Linear), { CFrame = CFrame.lookAt(endPos, endPos + dir) }):Play()
	Debris:AddItem(ball, life + 0.05)
end

-- Moving projectile visuals only; server owns hits.
function EffectsClient.drawProjectile(payload)
	if typeof(payload) ~= "table" or typeof(payload.origin) ~= "Vector3" then
		return
	end
	local speed = payload.speed or 60
	local range = payload.range or 30
	local origin = withHeight(payload.origin)
	local dir = (payload.direction or Vector3.new(0, 0, -1))
	local color = payload.color or Color3.fromRGB(120, 220, 255)

	if payload.kind == "sword_wave" then
		drawMovingBladeWave(origin, dir, range, speed, color)
	elseif payload.kind == "bow_arrow" then
		drawMovingNeedle(origin, dir, range, speed, color, 0.28, 3.8)
	elseif payload.kind == "ice_shard" then
		drawMovingNeedle(origin, dir, range, speed, color, 0.34, 2.7)
	elseif payload.kind == "matchlock_shot" then
		drawMovingNeedle(origin, dir, range, speed, color, 0.2, 2.2)
	else
		drawMovingOrb(origin, dir, range, speed, color, payload.radius or 0.6)
	end
end

function EffectsClient.updateAttackPreview(origin: Vector3, direction: Vector3, weapon, targetPoint: Vector3?)
	previewFolder = getNamedFolder(PREVIEW_FOLDER_NAME, previewFolder)
	clearFolder(previewFolder)

	if not weapon then
		return
	end

	local color = weapon.color or Color3.fromRGB(224, 188, 92)
	local hitType = weapon.hitType
	local range = math.min(weapon.range or 7, 70)
	local alpha = 0.42

	if hitType == "circle" or hitType == "slam" then
		drawPreviewCircle(previewFolder, origin, range, color, alpha)
	elseif hitType == "line" or hitType == "precise_line" or hitType == "projectile" then
		drawPreviewLine(previewFolder, origin, direction, range, math.max(weapon.width or 0.6, 0.16), color, alpha)
	else
		drawPreviewArc(previewFolder, origin, direction, range, weapon.angle or 100, color, alpha)
	end
end

function EffectsClient.clearPreview()
	if previewFolder then
		clearFolder(previewFolder)
	end
end

function EffectsClient.updateChargePreview(origin: Vector3, direction: Vector3, skill, ratio: number, color: Color3?)
	chargeFolder = getNamedFolder(CHARGE_FOLDER_NAME, chargeFolder)
	clearFolder(chargeFolder)

	local chargeColor = color or Color3.fromRGB(139, 211, 255)
	local range = skill.range or 12.8
	if skill.hitType == "line" or skill.hitType == "precise_line" then
		local width = skill.width or 1
		drawPreviewLine(chargeFolder, origin, direction, range, width, chargeColor, 0.42)
		makeStaticLine(
			chargeFolder,
			withHeight(origin),
			withHeight(origin + direction * range * math.clamp(ratio, 0, 1)),
			math.max(width * 0.35, 0.18),
			Color3.fromRGB(255, 255, 255),
			0.08
		)
		return
	end

	local angle = skill.angle or 210
	drawPreviewArc(chargeFolder, origin, direction, range, angle, chargeColor, 0.48)

	local halfLineDirection = rotateFlat(direction, 0)
	makeStaticLine(
		chargeFolder,
		withHeight(origin),
		withHeight(origin + halfLineDirection * range * (skill.chargeThreshold or 0.5)),
		0.26,
		if ratio >= (skill.chargeThreshold or 0.5) then Color3.fromRGB(255, 255, 255) else Color3.fromRGB(255, 90, 90),
		0.1
	)

	local barRange = range * math.clamp(ratio, 0, 1)
	drawPreviewArc(chargeFolder, origin, direction, barRange, angle, Color3.fromRGB(255, 255, 255), 0.18)
end

function EffectsClient.clearChargePreview()
	if chargeFolder then
		clearFolder(chargeFolder)
	end
end

function EffectsClient.updateAimCrosshair(position: Vector3, color: Color3?)
	aimFolder = getNamedFolder(AIM_FOLDER_NAME, aimFolder)
	clearFolder(aimFolder)

	local crossColor = Color3.fromRGB(255, 255, 255)
	local p = withHeight(position)
	local xAxis = Vector3.new(1, 0, 0)
	local zAxis = Vector3.new(0, 0, 1)
	local black = Color3.fromRGB(0, 0, 0)
	makeStaticLine(aimFolder, p - xAxis * 1.6, p - xAxis * 0.38, 0.22, black, 0.36)
	makeStaticLine(aimFolder, p + xAxis * 0.38, p + xAxis * 1.6, 0.22, black, 0.36)
	makeStaticLine(aimFolder, p - zAxis * 1.6, p - zAxis * 0.38, 0.22, black, 0.36)
	makeStaticLine(aimFolder, p + zAxis * 0.38, p + zAxis * 1.6, 0.22, black, 0.36)
	makeStaticLine(aimFolder, p - xAxis * 1.45, p - xAxis * 0.46, 0.1, crossColor, 0.04)
	makeStaticLine(aimFolder, p + xAxis * 0.46, p + xAxis * 1.45, 0.1, crossColor, 0.04)
	makeStaticLine(aimFolder, p - zAxis * 1.45, p - zAxis * 0.46, 0.1, crossColor, 0.04)
	makeStaticLine(aimFolder, p + zAxis * 0.46, p + zAxis * 1.45, 0.1, crossColor, 0.04)
	makeStaticBlock(aimFolder, position, Vector3.new(0.26, 0.08, 0.26), crossColor, 0.02)
end

function EffectsClient.clearAimCrosshair()
	if aimFolder then
		clearFolder(aimFolder)
	end
end

function EffectsClient.drawTelegraph(payload)
	if typeof(payload) ~= "table" or typeof(payload.origin) ~= "Vector3" then
		return
	end

	local color = payload.color or Color3.fromRGB(69, 243, 255)
	local duration = payload.duration or 1
	local origin = payload.origin
	local telegraphFolder = Instance.new("Folder")
	telegraphFolder.Name = "Telegraph"
	telegraphFolder.Parent = getFolder()
	Debris:AddItem(telegraphFolder, duration + 0.35)

	local function drawOnce(progress: number?)
		clearFolder(telegraphFolder)
		local drawOrigin = origin
		local drawDirection = payload.direction or Vector3.new(0, 0, -1)
		if payload.follow then
			local root = rootOfUser(payload.userId)
			if root then
				drawOrigin = root.Position
				drawDirection = aimOfUser(payload.userId, drawDirection)
			end
		end
		if payload.kind == "magic_target" then
			drawPreviewCircle(telegraphFolder, drawOrigin, payload.range or 1.5, color, 0.24)
			return
		end
		if payload.hitType == "circle" then
			local range = payload.range or 10
			if payload.grow then
				range *= math.clamp(progress or 1, 0.18, 1)
			end
			drawPreviewCircle(telegraphFolder, drawOrigin, range, color, 0.28)
		elseif payload.hitType == "line" then
			drawPreviewLine(telegraphFolder, drawOrigin, drawDirection, payload.range or 12, payload.width or 1, color, 0.35)
		elseif payload.hitType == "arc" or payload.hitType == "blade_sweep" then
			drawPreviewArc(telegraphFolder, drawOrigin, drawDirection, payload.range or 12, payload.angle or 180, color, 0.38)
		end
	end

	if payload.follow then
		local started = os.clock()
		local connection
		connection = RunService.RenderStepped:Connect(function()
			local elapsed = os.clock() - started
			if not telegraphFolder.Parent or elapsed > duration then
				if connection then
					connection:Disconnect()
				end
				return
			end
			drawOnce(math.clamp(elapsed / math.max(duration, 0.01), 0, 1))
		end)
		drawOnce(0)
		return
	end

	if payload.kind == "magic_target" then
		local range = payload.range or 3.5
		local started = os.clock()
		local connection
		connection = RunService.RenderStepped:Connect(function()
			if not telegraphFolder.Parent then
				if connection then
					connection:Disconnect()
				end
				return
			end
			local t = math.clamp((os.clock() - started) / math.max(duration, 0.01), 0, 1)
			clearFolder(telegraphFolder)
			if t >= 1 then
				if connection then
					connection:Disconnect()
				end
				return
			end
			drawPreviewCircle(telegraphFolder, origin, range * (0.18 + 0.82 * t), color, 0.16 + 0.56 * t)
		end)
		return
	end

	if payload.hitType == "circle" then
		local range = payload.range or 10
		for step = 0, 3 do
			task.delay(step * duration / 4, function()
				if telegraphFolder.Parent then
					drawPreviewCircle(telegraphFolder, origin, range * (0.25 + step * 0.25), color, 0.28)
				end
			end)
		end
	elseif payload.hitType == "line" then
		drawPreviewLine(telegraphFolder, origin, payload.direction or Vector3.new(0, 0, -1), payload.range or 12, payload.width or 1, color, 0.35)
	elseif payload.hitType == "arc" or payload.hitType == "blade_sweep" then
		drawPreviewArc(telegraphFolder, origin, payload.direction or Vector3.new(0, 0, -1), payload.range or 12, payload.angle or 180, color, 0.38)
	end
end

function EffectsClient.updateDaggerQTE(origin: Vector3, target: Vector3, state, elapsed: number)
	qteFolder = getNamedFolder(QTE_FOLDER_NAME, qteFolder)
	clearFolder(qteFolder)

	makeStaticLine(qteFolder, withHeight(origin), withHeight(target), 0.12, Color3.fromRGB(180, 180, 190), 0.32)
	drawPreviewCircle(qteFolder, origin, 2.0, Color3.fromRGB(255, 255, 255), 0.25)

	local lock = state.lock or 0.7
	local window = state.window or 0.9
	local perfect = state.perfect or 0.56
	local tolerance = state.tolerance or 0.15
	if elapsed < lock then
		drawPreviewCircle(qteFolder, origin, 4.4, Color3.fromRGB(160, 160, 170), 0.4)
		return
	end

	local t = math.clamp((elapsed - lock) / window, 0, 1)
	local bigRadius = 4.4 - 2.4 * t
	local delta = math.abs((elapsed - lock) - perfect)
	local color = if delta <= tolerance then Color3.fromRGB(80, 255, 160) else Color3.fromRGB(255, 255, 255)
	drawPreviewCircle(qteFolder, origin, bigRadius, color, 0.08)
end

function EffectsClient.clearQTE()
	if qteFolder then
		clearFolder(qteFolder)
	end
end

function EffectsClient.drawAttackEffect(payload)
	if typeof(payload) ~= "table" then
		return
	end

	if payload.follow then
		local root = rootOfUser(payload.userId)
		if not root then
			return
		end
		local copy = table.clone(payload)
		copy.follow = false
		copy.origin = root.Position
		copy.direction = aimOfUser(payload.userId, payload.direction)
		EffectsClient.drawAttackEffect(copy)
		return
	end

	if payload.vfx == "punch" then
		EffectsClient.drawPunch(payload)
	elseif payload.vfx == "slash" then
		if (payload.hitType == "circle" or payload.hitType == "slam") and not payload.angle then
			payload.angle = 360
		end
		EffectsClient.drawArc(payload)
	else
		local shape = SHAPE[payload.hitType] or "arc"
		if shape == "circle" then
			EffectsClient.drawCircle(payload)
		elseif shape == "line" then
			EffectsClient.drawLine(payload)
		else
			EffectsClient.drawArc(payload)
		end
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
