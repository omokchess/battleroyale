# PIXELROYALE Roblox Prototype

This folder is the first Roblox remake scaffold for PIXELROYALE.

It is intentionally small:

- top-down camera
- Roblox server-authoritative melee hit checks
- weapon stat module
- RemoteEvent-based attack requests
- basic HP / weapon / attack UI
- generated flat arena parts

## How To Open In Studio

Roblox Studio is installed locally, but Rojo is not installed yet.

Recommended workflow:

1. Install Rojo and the Rojo Studio plugin.
2. From this folder, run:

   ```powershell
   rojo serve default.project.json
   ```

3. Open Roblox Studio.
4. Connect the Rojo plugin to the local server.
5. Press Play.

If you do not want to use Rojo yet, copy the scripts from `src` into the matching Studio services manually:

- `src/ReplicatedStorage/PixelRoyale` -> `ReplicatedStorage/PixelRoyale`
- `src/ServerScriptService` -> `ServerScriptService`
- `src/StarterPlayer/StarterPlayerScripts` -> `StarterPlayer/StarterPlayerScripts`

## Current Prototype Controls

- Move: Roblox default WASD movement
- Aim: mouse cursor on the arena plane
- Attack: left click or the on-screen Attack button
- Weapon switch: UI buttons on the left

The server owns damage, cooldown checks, and hit testing.

