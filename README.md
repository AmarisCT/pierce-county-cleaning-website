# pierce-county-cleaning-website

Official website for **Pierce County Cleaning Services LLC** — *Clean Spaces, Clear Minds.*
Residential and small-business cleaning in Tacoma, Puyallup, Lakewood, Spanaway and nearby Pierce County communities.

**Design:** "Stone & Linen" — warm stone background, condensed serif capitals (Instrument Serif), Jost for body text, thin ink rules between full-width sections, and photo-led panels. Photos go in `src/assets/photos/`; see [docs/photos.md](docs/photos.md).

> **Status: draft, not published.** Prices, policies and service areas need owner approval before launch. See [docs/launch-checklist.md](docs/launch-checklist.md).

## What's here

| Path | What it is |
| --- | --- |
| `src/pages/` | Page content (one HTML fragment per page, with title and description at the top) |
| `src/assets/config.js` | **Edit this first:** phone, email, quote form endpoint, show/hide prices |
| `src/assets/prices.js` | Draft launch prices and add-ons used on every page and in the quote estimator |
| `src/assets/site.css`, `site.js`, `quote.js` | Styles, shared behavior, quote form |
| `src/assets/photos/` | Your photos, named by slot (see docs/photos.md) |
| `build.js` | Builds the finished site into `site/` (no dependencies) |
| `site/` | Built website, ready to host. Don't edit by hand; edit `src/` and rebuild |
| `internal/pricing-calculator.html` | Private job-profit calculator. **Not part of the public site** — open it locally |
| `docs/` | Pricing, compliance notes, booking tool comparison, launch checklist |
| `tests/` | Checks for the price estimator and the built pages |

## Pages

Home · Residential · Commercial · Services & Pricing · Service Areas · About · FAQ · Contact · Request a Quote · Privacy Policy · Terms of Service

## Making changes

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
# 1. Edit files in src/
# 2. Rebuild the site
node build.js
# 3. Run the checks
node tests/run.js
# 4. Preview locally, then open http://localhost:8080
npx --yes serve site -l 8080
```

To set your domain in canonical links and the sitemap: `SITE_URL=https://yourdomain.com node build.js`

## Quote form

The quote page shows an instant estimate from `prices.js`. Submissions go to `quoteEndpoint` in `config.js`:

- **Not set (default):** nothing is sent. The customer sees their request formatted to copy and text/email you.
- **Set:** the form POSTs JSON to that URL. Works with Formspree, Basin, Getform, or a booking tool's webhook. Pick one that keeps submissions private and lets you get email alerts.

The form asks customers **not** to type door or alarm codes. Collect those later inside your booking tool.

## Publishing

Nothing is published automatically. When the owner approves:

1. Confirm the domain and run `SITE_URL=https://yourdomain.com node build.js`.
2. Host the `site/` folder on GitHub Pages, Netlify or Cloudflare Pages. A manual GitHub Pages workflow is included at `.github/workflows/deploy.yml` (run it from the Actions tab; Pages must be enabled for the repo, which requires a public repo or a paid GitHub plan).
3. Point the domain's DNS at the host.

## Ground rules for site content

- No testimonials, reviews, ratings, certifications or "insured and bonded" claims until they are real and documented.
- Keep the business name exactly **Pierce County Cleaning Services LLC**.
- Routine house cleaning invoices carry no Washington sales tax. Don't add a sales-tax line to the site's prices.
