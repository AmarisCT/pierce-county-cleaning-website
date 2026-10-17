# Photos

The "Stone & Linen" design is photo-led. Ten slots use your own photos (below). The rest use free stock photos from Unsplash, listed in `src/photos.json` and credited below. The images load from Unsplash's servers, so they appear on the live site but not inside Claude's preview. Swap in your own photos whenever you have them; real photos of your work build the most trust.

## Your photos (in `src/assets/photos/`, used instead of stock)

| Slot | Photo |
| --- | --- |
| `home-hero` | Sunset living room with ocean view (cropped wide; centered on the sun on phones) |
| `home-about` | Folded towels with a cotton branch |
| `service-standard`, `res-standard` | White bed with a flowering branch |
| `service-recurring`, `res-recurring` | Sunlit white kitchen |
| `service-deep`, `res-deep` | Pink tiled bathroom with a tub |
| `service-moveout`, `res-moveout` | Empty apartment with window light on the floor |

Use only photos you have the right to use on a business website. Photos saved from Pinterest or other people's accounts usually belong to someone else; ask for permission or replace them with your own or licensed stock.

## Current stock photos for the remaining slots (Unsplash License, free for commercial use, credit not required)

| Slot | Photo | Photographer |
| --- | --- | --- |
| `home-hero` | Sunlit living room with a sectional sofa and coffee table | [Christian Lambert](https://unsplash.com/photos/sectional-sofa-near-coffee-table-and-window-hlOpCML8twI) |
| `home-about` | Stack of clean white towels in soft morning sun | [Mads Leif Hansen](https://unsplash.com/photos/stack-of-clean-white-towels-on-a-surface-qPNgpYUCW0c) |
| `home-promise` | White towel on a towel rack against a bathroom wall | [Lukas Schroeder](https://unsplash.com/photos/white-towel-on-stainless-steel-towel-rack-sB2K_If9qI0) |
| `service-standard` | Bed made with white sheets and pillows | [Liz Vo](https://unsplash.com/photos/a-bed-with-white-sheets-and-white-pillows-pl3sj3DigxM) |
| `service-recurring` | Bright kitchen with a sink, stove and window | [Bailey Alexander](https://unsplash.com/photos/a-kitchen-with-a-sink-stove-and-a-window-2dnjAACDNd8) |
| `service-deep` | White bath towel on a white bathtub | [the blowup](https://unsplash.com/photos/white-bath-towel-on-white-ceramic-bathtub-4dUC7Fine5g) |
| `service-moveout` | Empty room with a wooden floor and white walls | [Lisa Anna](https://unsplash.com/photos/an-empty-room-with-a-wooden-floor-and-white-walls-z6YCmjEAtMw) |
| `res-standard` | Close-up of a smooth white bed sheet | [Kateryna Hliznitsova](https://unsplash.com/photos/a-close-up-of-a-bed-with-a-white-sheet-2NDtPNiLcD0) |
| `res-deep` | Clean bathroom sink with a large mirror | [Peter Muniz](https://unsplash.com/photos/a-bathroom-sink-with-a-large-mirror-above-it-zUV2aeRx2Mc) |
| `res-moveout` | Empty room with hardwood floors and white walls | [Lisa Anna](https://unsplash.com/photos/an-empty-room-with-hard-wood-floors-and-white-walls-ITA4ysSN8xA) |
| `res-recurring` | Sunlit kitchen with a white island and cabinets | [Jason Briscoe](https://unsplash.com/photos/white-wooden-kitchen-island-and-cupboard-cabinets-near-glass-panel-door-AQl-J19ocWE) |
| `com-office` | Quiet office with a desk, chair and a vase of flowers | [Francesco Liotti](https://unsplash.com/photos/a-desk-with-a-chair-and-a-vase-of-flowers-3HP6_D9hxFY) |
| `services-addons` | Bright kitchen with white cabinets and hexagonal wall tiles | [roam in color](https://unsplash.com/photos/kitchen-with-white-cabinets-and-tiles-z3QZ6gjGRt4) |
| `about` | Two amber spray bottles on a wooden table | [Daiga Ellaby](https://unsplash.com/photos/two-brown-spray-bottles-on-brown-table-uooMllXe6gE) |
| `areas` | Mount Rainier at sunset | [Caleb Riston](https://unsplash.com/photos/mount-rainier-under-soft-sky-TXiBwX0kg-Q) |

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
