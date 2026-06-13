# Art assets — Ninja Adventure Asset Pack

**Pack:** Ninja Adventure Asset Pack (full pack)
**Author:** Pixel-Boy & AAA (pixel-boy)
**License:** CC0 1.0 Universal — full text in `LICENSE.txt`. Commercial use
and redistribution permitted; attribution not required but appreciated.
**Source:** https://pixel-boy.itch.io/ninja-adventure-asset-pack

This game has an in-app coin economy (cosmetic shop). CC0 places no
restriction on commercial use or redistribution, so it is safe here.

## Vendored subset (curated from the full 1915-sprite pack)
16×16 base grid. Any weapon without a pack equivalent (firearms, etc.)
keeps the legacy procedural drawing, and **every sprite draw falls back to
the legacy shape renderer if an asset fails to load** — the game never
breaks on a missing asset.

- `character/*.png` — body SpriteSheets (64×112 = 16×16 frames, 4 cols ×
  7 rows): Boy, Knight, KnightGold, FighterRed, GladiatorBlue, Cavegirl,
  DemonRed, Hunter. Tinted per shop cosmetic.
- `weapon/*.png` — small in-hand sprites mapped to our 20 weapons
  (Sword, Axe, BigSword, Sai=dagger, Rapier, Hammer, Katana, Lance=spear,
  Lance2=harpoon, Sword2=guardian, Ninjaku=chakram, MagicWand=magicstaff,
  …). Firearms fall back to procedural.
- `fx/` — Slash sheets (Arc/Circular/Slash01-03), Particle / Smoke /
  Elemental / Magic burst sheets.
- `map/` — TilesetField (grass), TilesetFloor, TilesetNature (objects).
- `item/` — Potion (heal), Object (bag/crate/etc. for cover & mines).
- `ui/` — Theme + Dialog 9-slice panels.
