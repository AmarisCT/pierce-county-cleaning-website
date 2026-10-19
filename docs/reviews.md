# Reviews

Customers leave reviews on the website's **Reviews** page (`reviews.html`). Reviews you approve show on that page and on the home page. Everything runs through the same free Google Apps Script and Google Sheet as the quote form.

## How it works

1. A customer fills in the form on `reviews.html`: rating, review, name, email, and optionally city and service. They must tick a box allowing you to post it.
2. The review is added to the **Reviews** tab of your Quotes sheet with **Show on website = No**, and you get an email: "New review to check".
3. You set **Show on website** to **Yes**. Within about 5 minutes it appears on the website with the first name, last initial, city, rating and review. Emails and full names are never shown.
4. Invoices sent from the sheet include a "How did we do? Leave a review" link to that page, as long as `website` is filled in on Config.gs.

The reviews section on the home page stays hidden until at least one review is set to Yes. No sample or placeholder reviews are ever shown.

## Rules for approving reviews

- Set **Yes** for every genuine review from a customer, including critical ones.
- Set **No** only for spam, people who weren't customers, or reviews containing private details (an address or entry code). You can also email the customer and ask them to resend it without those details.
- Never edit a customer's wording, and never write or post reviews yourself or for family, friends or contractors.

Hiding negative reviews, or implying the reviews shown are all of them when they aren't, can break the FTC's rule on consumer reviews. Choosing which reviews go on your own site turns them into advertising, so they must be real.

## Adding your Google reviews (until the automatic feed is on)

When a Google review comes in, add a row to the Reviews tab:

| Column | Enter |
| --- | --- |
| Date | The date of the Google review |
| Show on website | Yes |
| Rating | 1–5, as on Google |
| Review | The review, copied word for word |
| Name shown | The name as Google shows it, shortened to first name + last initial |
| Source | Google |
| Link | Your profile's Google Maps link, or the review's share link |

On the website it shows as "on Google", with a link.

## Website settings (`src/assets/config.js`)

| Setting | What it does |
| --- | --- |
| `googleReviewUrl` | The short link from your Business Profile's **Ask for reviews**. Adds a "Review us on Google" button to the Reviews page and its thank-you message. |
| `googleProfileUrl` | Your profile's Google Maps link. Adds "All reviews on Google" under the reviews. |

## One-time update to the Apps Script (needed for reviews)

1. Open your Quotes sheet → **Extensions → Apps Script**.
2. Open **Code.gs**, select everything, and paste in the new `apps-script/Code.gs`. Don't touch Config.gs.
3. In Config.gs, make sure `website` is set to `https://amarisct.github.io/pierce-county-cleaning-website/`. This adds the review link to invoices.
4. Save, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The web app address stays the same.
5. Back in the sheet, reload it, then run **PCCS → Set up this sheet**. This adds the Reviews tab.
6. Test: leave a review on the website, check the email, set it to Yes, and refresh the Reviews page after a few minutes. Then delete the test row.

Until this update is done, the Reviews page offers to email the review to you instead.

## Later: Google reviews shown automatically

Google's Places API can show your Google reviews live, without copying them. It returns up to 5 reviews.

- **Needs:** a verified Business Profile, plus a Google Cloud project with a billing account (card on file). Set a daily request cap and a budget alert so it stays within Google's free monthly usage; check Google's pricing page for the current allowance.
- **Google's rules:** reviews can't be stored or cached, so they're fetched in the visitor's browser each time. They must show the reviewer's name or photo, the Google Maps logo or the words "Google Maps", and a link to the review on Google.
- **When you're ready:** send Claude the API key restricted to the website address, and your place ID. Once it's on, stop copying Google reviews into the sheet so they don't show twice.
