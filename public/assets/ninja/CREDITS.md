# Art assets — Ninja Adventure Asset Pack

**Pack:** Ninja Adventure Asset Pack
**Author:** Pixel-Boy & AAA (pixel-boy)
**License:** CC0 1.0 Universal (public domain). Commercial use and
redistribution permitted; attribution not required but appreciated.
**Sources:**
- itch.io: https://pixel-boy.itch.io/ninja-adventure-asset-pack
- GitHub (CC0, official): https://github.com/pixel-boy/NinjaAdventure
- OpenGameArt mirror: https://opengameart.org/content/ninja-adventure-free-sprite

This game has an in-app coin economy (cosmetic shop). CC0 places no
restriction on commercial use or redistribution, so it is safe here.

## Vendored subset
The sprites under this folder were taken from the official GitHub repo
(`content/`), which is the demo subset of the pack (16×16 base grid).
Used as the single coherent pack per the theme spec; any missing pieces
are filled procedurally in the same palette/outline style, and every
sprite draw falls back to the legacy shape renderer if an asset fails to
load (the game never breaks on a missing asset).

- `character/` — body sheets (16×16 frames; 64×112 = 4 frames × 7 rows),
  `Shadow.png` foot shadow.
- `weapon/<name>/in_hand.png` — small hand-overlay sprite; `sprite.png`
  item icon. (axe, big_sword, bone, book, club)
- `map/tileset_*.png` — floor / wall / village / interior tilesets.
- `destroyable/` — crate, pot, grass (used as arena cover objects).
- `particle/` — grass, leaf, pot, rock, wood burst sheets (16×16 frames).
- `ui/heart*.png` — heart pickups / health UI.

The full pack (hundreds more sprites: every weapon, full VFX, UI frames)
is available from the itch.io page above if broader coverage is wanted.
