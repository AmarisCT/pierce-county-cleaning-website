# Booking, CRM and payments: options to compare

The website handles quote requests. Day-to-day operations (scheduling cleaners, customer records, reminders, card payments, checklists) belong in a field-service tool rather than custom code. Prices and features change often, so confirm current plans on each vendor's site before choosing.

| Need | What to look for |
| --- | --- |
| Online booking and quote requests | Request form or booking page that can replace or receive this site's quote form |
| Scheduling and cleaner assignment | Calendar by cleaner, recurring visits, mobile app for staff |
| Customer records | Address, access notes visible only to the assigned cleaner, history |
| Reminders | Automatic text/email confirmations and day-before reminders |
| Payments | Card on file, charge after visit, receipts, tips to cleaner |
| Checklists | Per-job checklist completed in the staff app, with photos |
| Accounting | Sync to QuickBooks Online or Wave |

Tools commonly used by small cleaning companies, to evaluate:

- **Jobber** — quotes, scheduling, invoicing, client hub, staff app
- **Housecall Pro** — similar scope, strong on online booking
- **ZenMaid** — built specifically for maid services
- **Square Appointments + Square Payments** — lowest setup effort, lighter on field-service features

Decision for the owner: pick one, then set `quoteEndpoint` in `src/assets/config.js` to that tool's request webhook, or link the quote button straight to its booking page.
