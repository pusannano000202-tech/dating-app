# Official League of Legends rank emblems

These are Riot Games' original PNG assets, copied byte-for-byte from the official developer archive. Only their local filenames were normalized. No cropping, resizing, recoloring, recompression, AI generation, or redesign was performed.

## Provenance

- Retrieved and verified: **2026-09-10**.
- Official source page: [Riot Developer Portal — League of Legends, Icons and Emblems](https://developer.riotgames.com/docs/lol).
- Archive linked by that page: [ranked-emblems-latest.zip](https://static.developer.riotgames.com/docs/lol/ranked-emblems-latest.zip).
- Official preview linked by that page: [emblems-and-positions-latest.jpg](https://static.developer.riotgames.com/img/docs/lol/emblems-and-positions-latest.jpg).
- Downloaded archive SHA-256: `055A79D26590F2016BC97BD09EEA0459C7D29F3A68D850E9C33DA006FDB8D72F`.
- Original archive directory for every entry below: `Ranked Emblems Latest/`.
- The archive's separate `Tier Wings/` and `Wings/` assets were not included.
- `latest` is a mutable upstream name; the date and hashes identify this checked snapshot, not a permanent release version.

## Included files

All 10 files are **1000 × 1000 PNGs with transparent space around the artwork**. Public URLs are `/game-assets/lol-ranks/<local filename>`.

| Local filename | Original filename | Dimensions | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `iron.png` | `Rank=Iron.png` | 1000 × 1000 | 188074 | `A9B030AF5525D1FB7F100613A007DE5F7B0FD586948A742B3A366A2B912D8A2D` |
| `bronze.png` | `Rank=Bronze.png` | 1000 × 1000 | 334306 | `2CE661D817067EEF87C5F57C9DDF1CF8213547F87C3D640669458EACD0FDA32C` |
| `silver.png` | `Rank=Silver.png` | 1000 × 1000 | 481949 | `566C3DEF707C64384C0CC129E1F09AAFFCE75373364343215135F711918D0C26` |
| `gold.png` | `Rank=Gold.png` | 1000 × 1000 | 554097 | `0E736C3A19F22B4514C897FD179F728093913AC83642F352632D3BD9C959CE31` |
| `platinum.png` | `Rank=Platinum.png` | 1000 × 1000 | 498643 | `3AC5FA4D68DB644A36F54C9258F18AD4669429528497458CB2401FD5F12B9E25` |
| `emerald.png` | `Rank=Emerald.png` | 1000 × 1000 | 493524 | `3C3252191B111CE11F44F59745B788A4100BFB1A3ECC1B8A7DD87AC418E326B8` |
| `diamond.png` | `Rank=Diamond.png` | 1000 × 1000 | 591513 | `052C7A82914ECCC5333DC20F67B3208CF854F66130DB12E4AA4F947F76A0B60F` |
| `master.png` | `Rank=Master.png` | 1000 × 1000 | 578336 | `83FE38066DFC796B55C46BB17CAE72A0B23AF93B819ADFAF02C1C79B52919568` |
| `grandmaster.png` | `Rank=Grandmaster.png` | 1000 × 1000 | 677483 | `EA4F8579A5C2BBC82200531BC007D009AB39F8F59B2F81E2932D62FF63BD8C25` |
| `challenger.png` | `Rank=Challenger.png` | 1000 × 1000 | 730997 | `668F402B0C800562B61E7128D6B01BBFC81F508CC8A6232276158416ED81F725` |

Total original image payload: **5,128,922 bytes**. Emerald is present; no missing tier or substitute image was used.

## Verification and display notes

- Enumerated the trusted ZIP before extracting only the 10 explicitly named PNG entries. No archive programs or scripts were executed.
- Verified each PNG signature and dimensions, and compared each local SHA-256 with the corresponding uncompressed archive entry: **10/10 identical**.
- Opened all 10 local originals for visual inspection.
- Artwork size differs between tiers: Iron has notably more transparent space and appears smaller at the same full-canvas element size. `emblems.json` records each original canvas and the smallest integer rectangle containing every pixel with alpha greater than zero. Bounds were measured by read-only `sharp(...).ensureAlpha().raw()` pixel inspection, without writing a derivative image. The UI may use this metadata to normalize transparent padding with a CSS viewport while preserving aspect ratio and every nontransparent pixel. Do not crop artwork pixels, stretch, recolor, or fabricate a replacement.
- Always pair the emblem with the written tier label; color or an emblem alone must not be the only way to identify a tier.
- These graphics identify a tier selected or displayed by the application. They do not verify a player's Riot account, rank, official MMR, school, or eligibility.
- This asset-only verification does not establish browser layout, delivery performance, Riot endorsement, product registration, or deployment readiness.

## Rights and permission caveat

Riot Games retains the rights to these assets. They are not project-owned artwork and this repository does not relicense them.

The [Riot developer documentation](https://developer.riotgames.com/docs/lol) directs developers to its current policies, terms and legal notices. It lists game-specific static data among usable asset categories, requires a readily visible non-endorsement notice, and describes product registration requirements even when documented APIs are not used. Before public distribution, the product owner must check the applicable [Developer Terms](https://developer.riotgames.com/terms) and [General Policies](https://developer.riotgames.com/policies/general), complete any required registration/approval, and place the current required notice in the product. A README is not a substitute for that player-visible notice.

No Riot registration or approval was requested or verified in this asset task. Availability of the official download is provenance evidence, not a determination that this application's complete use case or monetization is approved.
