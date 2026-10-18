# Photos

The "Stone & Linen" design is photo-led. Fourteen slots use your own photos (below). The one remaining slot, `home-promise`, uses a free stock photo from Unsplash, listed in `src/photos.json` and credited below. That image loads from Unsplash's servers, so it appears on the live site but not inside Claude's preview. Swap in your own photos whenever you have them; real photos of your work build the most trust.

## Your photos (in `src/assets/photos/`, used instead of stock)

| Slot | Photo |
| --- | --- |
| `home-hero` | Sunset living room with ocean view (cropped wide; centered on the sun on phones) |
| `home-about` | Folded towels with a cotton branch |
| `service-standard`, `res-standard` | White bed with a flowering branch |
| `service-recurring`, `res-recurring` | Sunlit white kitchen |
| `service-deep`, `res-deep` | Pink tiled bathroom with a tub |
| `service-moveout`, `res-moveout` | Empty apartment with window light on the floor |
| `about` | Amber bottles with dried flowers on a wooden tray |
| `services-addons` | Hexagon-tile kitchen backsplash with a gas range |
| `com-office` | Sunlit desk with flowers and a cup of coffee |
| `areas` | Mount Rainier at sunset |

Use only photos you have the right to use on a business website. Photos saved from Pinterest or other people's accounts usually belong to someone else; ask for permission or replace them with your own or licensed stock.

## Stock photo still in use (Unsplash License, free for commercial use, credit not required)

| Slot | Photo | Photographer |
| --- | --- | --- |
| `home-promise` | White towel on a towel rack against a bathroom wall | [Lukas Schroeder](https://unsplash.com/photos/white-towel-on-stainless-steel-towel-rack-sB2K_If9qI0) |

The other slots in `src/photos.json` are fallbacks only; they're used if you delete one of your own photos.

## How to add a photo

1. Save the image in `src/assets/photos/` using the slot name below, as `.jpg`, `.jpeg`, `.webp` or `.png` (for example `home-hero.jpg`).
2. Run `node build.js`. Your file replaces the stock photo everywhere that slot is used.

To use a different Unsplash photo instead, change that slot's `id` in `src/photos.json` (the `photo-…` part of its images.unsplash.com address).

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
