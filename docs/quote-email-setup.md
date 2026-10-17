# Quote & invoice emails — setup

Free, using your own Google account. When someone sends the website's quote form:

1. Their request is added as a row in your **PCCS Quotes** Google Sheet.
2. They're emailed a **quote** with their service, home size, each add-on and its price, and the total. The price is recalculated on Google's side, so a visitor can't change it.
3. You get an **alert email** with everything they entered, including their notes. Reply to it to answer the customer directly.

After the clean, you send the **invoice** from the Sheet with one click.

Takes about 15 minutes. Use a computer; the Apps Script editor is hard to use on a phone.

## 1. Use a business Gmail (recommended)

Quotes are sent from the Google account that runs the script. Create a free Gmail just for the business (for example `piercecountycleaning@gmail.com`) and do the steps below signed in as that account, so customers never see your personal address.

## 2. Create the Sheet and paste the code

1. Go to **sheets.new**. Name the sheet **PCCS Quotes**.
2. Click **Extensions → Apps Script**. Name the project **PCCS Quotes** (top left).
3. In the file list, click **Code.gs**, select everything in it and delete it. Paste the full contents of [`apps-script/Code.gs`](../apps-script/Code.gs) from this repo. (On GitHub, open the file and use the **Copy raw file** button.)
4. Click **+** next to Files → **Script**, name it **Config**, delete what's in it, and paste [`apps-script/Config.gs`](../apps-script/Config.gs).
5. In **Config**, fill in:
   - `phone` — your business phone
   - `website` — your website address
   - `paymentInstructions` — how customers pay, e.g. `Pay by Zelle to (253) 555-0142, cash, or check payable to Pierce County Cleaning Services LLC.` (Invoices won't send until this is filled in.)
6. Click **Save** (the disk icon).

## 3. Run setup once

1. In the toolbar, pick **setup** from the function dropdown and click **Run**.
2. Google asks for permission. Click **Review permissions**, pick the account, then **Advanced → Go to PCCS Quotes (unsafe) → Allow**. The warning appears because this is your own private script rather than a published app. It asks to edit this spreadsheet and send email as you.
3. Back in the Sheet, a **Quotes** tab now has the column headings, and a **PCCS** menu appears (reload the Sheet if you don't see it).

## 4. Turn it into a web address for the website

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Description: `Website quote form`. **Execute as: Me**. **Who has access: Anyone**.
4. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
5. Send that URL to Claude to connect it, or paste it as `quoteEndpoint` in `src/assets/config.js`, run `node build.js`, and push.

"Anyone" means the website's visitors can send requests to it. They can't see your Sheet. The URL appears in the website's code, which is normal; the script protects itself (see Limits).

## 5. Test

1. Sheet menu: **PCCS → Send a test quote to me** to see the quote email.
2. Then fill in the quote form on the live website with your own email. You should get the quote and the alert, and a new row appears in the Sheet.

## Using it day to day

| Column | What to do |
| --- | --- |
| Status | Update as you go: New → Contacted → Booked → Completed → Invoiced → Paid (or Lost) |
| Service date | Fill in when the job is scheduled |
| Final amount | Leave empty to bill the quoted total, or enter the actual amount |
| Invoice note | If the final amount differs, a short reason, e.g. `Extra bathroom`. It appears on the invoice. |
| Notes | The customer's notes from the form (never included in their emails) |

**To send an invoice:** click anywhere in the customer's row, then **PCCS → Send invoice for selected row**. The invoice lists the quoted items, adds a line for any difference with your note, and shows your payment instructions. The row gets an invoice number and moves to **Invoiced**. When you're paid, set Status to **Paid**.

Other menu items: **Resend quote for selected row** (if a customer lost it) and **Send a test quote to me**.

## When prices change

Prices live in `src/assets/prices.js`. After changing them:

1. Run `node build.js` (this updates `apps-script/Code.gs` to match the website).
2. In Apps Script, replace **Code.gs** with the new file. Leave **Config** alone.
3. **Deploy → Manage deployments →** pencil icon **→ Version: New version → Deploy**. The web address stays the same. Without this step the form keeps using the old code.

## Limits

- Free Gmail sends 100 emails a day. Each request sends 2 (customer + you), so the script stops at 45 requests a day (`maxQuotesPerDay` in Config). Visitors past that are asked to call or email instead.
- One request per email address every 10 minutes.
- Spam traps: a hidden field only bots fill in, and forms sent in under 3 seconds are ignored. Names and addresses containing links are rejected.
- If the customer's email fails, the request is still saved in the Sheet and your alert says to contact them yourself.

## Taxes and wording

The quote and invoice show **WA sales tax: $0.00** because routine house cleaning is reported under Service & Other B&O, not retail sales tax. Confirm with your accountant. You can hide that line with `showSalesTaxLine: false`.
