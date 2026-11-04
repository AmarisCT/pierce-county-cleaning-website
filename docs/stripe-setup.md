# Card payments with Stripe — setup

Once this is set up, every invoice you send from the **PCCS Quotes** sheet has a **Pay by card** button for the exact amount. The customer pays on Stripe's secure checkout page with their email already filled in. Every hour the sheet checks Stripe and moves paid invoices to **Paid**, with the date in **Paid on**.

There's no monthly fee and nothing to install. Stripe takes a fee from each card payment (see stripe.com/pricing).

How it works: each invoice gets its own Stripe payment link for its amount. The link closes after one payment. If you change the amount and resend, the old link is turned off and a new one goes out. If the customer already paid, nothing is resent and the row is marked Paid.

## 1. Finish activating your Stripe account

Stripe won't accept card payments until the account is activated. In the Stripe Dashboard, open the **Activate payments** (or **Complete your profile**) prompt and finish everything it asks for:

| Stripe asks for | What to enter |
| --- | --- |
| Business website | `https://amarisct.github.io/pierce-county-cleaning-website/` (already filled in) |
| Industry / business category | Cleaning and maintenance (janitorial services) |
| Product description | Residential and small-office cleaning in Pierce County, WA: standard, deep, move-in/move-out and recurring house cleaning, invoiced after each visit. |
| Customer support phone | The business phone (the same one you'll add to the website) |
| Statement descriptor | `PIERCE CO CLEANING` (the name on customers' card statements. Stripe filled in your website address, which customers won't recognize) |
| Bank account for payouts | The business checking account |
| Terms of service | Review and accept them yourself |

Stripe also double-checks the business address and owner details. That happens on its own, and Stripe emails if it needs a document.

## 2. Make a restricted key for the sheet

A restricted key lets the sheet do only what invoices need. It can't move money out or see your bank details.

1. In Stripe, go to **Developers → API keys** (or search the Dashboard for "API keys").
2. Click **Create restricted key**. If asked how you'll use it, choose the option for your own integration. Name it `PCCS invoices`.
3. Set these permissions and leave everything else at **None**:
   - **Products**: Write
   - **Prices**: Write
   - **Payment Links**: Write
   - **Checkout Sessions**: Read
4. Click **Create key** and copy it. It starts with `rk_live_`.

Keep the key private. Only paste it into the sheet (step 4), never into `Config.gs`, the website, an email or a chat. If it ever leaks, delete it in Stripe and make a new one.

## 3. Update the script in your sheet

1. Open the **PCCS Quotes** sheet → **Extensions → Apps Script**.
2. Click **Code.gs**, select everything and delete it, then paste the new [`apps-script/Code.gs`](../apps-script/Code.gs) from this repo (on GitHub: open the file → **Copy raw file**). Leave **Config** alone. Click **Save**.
3. Pick **setup** in the function dropdown and click **Run**. Google asks for permission again. The new permissions let the script talk to Stripe and run the hourly check. **Review permissions → your account → Advanced → Go to PCCS Quotes (unsafe) → Allow.** Setup adds two columns at the end of the Quotes tab: **Card pay link** and **Paid on**.
4. **Deploy → Manage deployments →** pencil icon **→ Version: New version → Deploy**. The website's web address stays the same.

## 4. Connect Stripe

1. Reload the sheet. Choose **PCCS → Connect Stripe (card payments)**.
2. Paste the `rk_live_` key and click **OK**. The sheet checks the key with Stripe before saving it.

To try it without real money first, make the same restricted key in Stripe's **test mode** (it starts with `rk_test_`). Connect it, send an invoice to yourself, pay with the test card `4242 4242 4242 4242` (any future date, any CVC), then choose **PCCS → Check for card payments**. When you're happy, run **Connect Stripe** again with your `rk_live_` key.

## Day to day

| You want to | Do this |
| --- | --- |
| Bill a customer | Same as before: click their row → **PCCS → Send invoice for selected row**. The invoice has the card button plus your `paymentInstructions` as "Other ways to pay" |
| See who has paid by card | Rows change to **Paid** within the hour. To check right away: **PCCS → Check for card payments** |
| Record Zelle, cash or check | Set Status to **Paid** yourself, as before |
| Refund a payment | In the Stripe Dashboard: **Payments** → the payment → **Refund**. Then update the row's Status |
| Turn card payments off | **PCCS → Connect Stripe** → type `DISCONNECT`. Links already sent keep working until you turn them off in Stripe (**Payment Links**) |

With Stripe connected, `paymentInstructions` in Config is optional. If it's empty, invoices show only the card button.

If Stripe has a problem while you're sending an invoice, the sheet tells you what Stripe said. It then asks whether to send the invoice without the card button.
