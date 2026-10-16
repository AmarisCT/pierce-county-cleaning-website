# Photos

The "Stone & Linen" design is photo-led. Until real photos are added, each photo slot shows a soft stone-toned placeholder with a small caption describing the shot.

## How to add a photo

1. Save the image in `src/assets/photos/` using the slot name below, as `.jpg`, `.jpeg`, `.webp` or `.png` (for example `home-hero.jpg`).
2. Run `node build.js`. The photo replaces the placeholder everywhere that slot is used.

`node build.js` lists any slots that still need a photo.

## Slots

| Slot name | Page | Suggested shot | Shape |
| --- | --- | --- | --- |
| `home-hero` | Home, top | Sunlit living room, freshly cleaned | Wide, at least 2400 px |
| `home-about` | Home | Folded white towels in warm light | Portrait or square |
| `home-promise` | Home, dark band | Quiet bathroom, linen towel on a hook, darker tones | Wide |
| `service-standard` | Home tiles | Freshly made bed | Square |
| `service-recurring` | Home tiles | Clean kitchen counter | Square |
| `service-deep` | Home tiles | Spotless bathroom tile | Square |
| `service-moveout` | Home tiles | Empty, bright room | Square |
| `res-standard` | Residential | Made bed, white linens | Portrait or square |
| `res-deep` | Residential | Bathroom tile and fixtures | Portrait or square |
| `res-moveout` | Residential | Empty bright room, wood floors | Portrait or square |
| `res-recurring` | Residential | Tidy kitchen in morning light | Portrait or square |
| `com-office` | Commercial | Quiet, tidy small office | Portrait or square |
| `services-addons` | Services & Prices | Kitchen detail work | Portrait or square |
| `about` | About | Linen and supplies arranged neatly | Portrait or square |
| `areas` | Service Areas | Pierce County street with evergreens | Portrait or square |

## Where photos can come from

- **Your own photos** of real jobs (with the customer's permission) are the most trustworthy.
- **Licensed stock**: Unsplash and Pexels allow free commercial use under their licenses; check each photo's license page before using it.
- Keep the look consistent: warm, soft natural light, neutral whites and stone colors, no people's faces unless you have a signed release.
- Don't use photos that suggest work you don't do (exterior windows, carpet shampooing) or a team size you don't have yet.
