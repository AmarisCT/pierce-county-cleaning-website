# Website launch checklist

Everything here needs the owner. Items are in the order they unblock launch.

## Before publishing

- [ ] Approve or change launch prices in `src/assets/prices.js` (see [pricing.md](pricing.md))
- [ ] Add business phone and email to `src/assets/config.js`
- [ ] Confirm the service areas on `service-areas.html`; remove any you won't serve at launch
- [ ] Confirm the contact hours on `contact.html`
- [ ] Write a short founding story on `about.html` (TODO marker in the file)
- [ ] Attorney review of `privacy.html` and `terms.html` (re-clean, cancellation fee, damage, staff non-solicitation)
- [ ] Choose a form service or booking tool and set `quoteEndpoint`
- [ ] Confirm ownership of the domain (piercecountycleaning.com was a proposal, not confirmed)
- [ ] Add the logo file to `src/assets/` and the header in `build.js`
- [ ] Add photos for the 15 photo slots (see [photos.md](photos.md))
- [ ] Only after certificates exist: add "insured and bonded" to `about.html`

## At publishing

- [ ] `SITE_URL=https://yourdomain.com node build.js`
- [ ] `node tests/run.js` passes
- [ ] Host `site/` and connect the domain
- [ ] Submit `sitemap.xml` in Google Search Console
- [ ] Add the website link to Google Business Profile, Yelp and Angi

## After publishing

- [ ] Send a test quote request and confirm it arrives
- [ ] Check the site on a phone
- [ ] Add real customer reviews only with permission, quoted exactly
