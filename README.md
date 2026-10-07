# ChillOrder Food Ordering System

ChillOrder is a food-ordering web application for food courts, canteens, and shared dining areas. Customers can order food from several stalls in one place and follow the progress of their order.

## What You Can Do

- Scan a table QR code or enter a table code.
- Browse food from different stalls.
- Search and filter the menu.
- Discover clearly labeled sponsored stalls before organic popular or top-rated results.
- Add food to a cart and change the quantity.
- Add a note for the food stall.
- Choose card, e-wallet, or counter payment.
- View an e-bill for counter payment.
- Track the order until it is completed.

## How Customers Use the Web App

1. Scan the QR code on the table or enter the table code.
2. Choose a food stall or browse all available food.
3. Select the food and add it to the cart.
4. Check the order details and quantities.
5. Continue to checkout and choose a payment method.
6. Submit the order.
7. Follow the order status on the order-tracking page.

Customers do not need an account to place an order.

## How Food Stall Staff Use the Web App

1. Sign in with the account provided privately by the administrator.
2. View orders for the assigned stall.
3. Confirm counter payments when required.
4. Receive an order and update its progress.
5. Mark the order as completed when it is ready.
6. Manage the stall information, menu, prices, stock, and food availability.
7. Request a Featured or Premium promotion plan for admin approval.
8. On an active paid plan, record business expenses and review the analytics included in that tier.

Each staff account can access only its assigned stall.

## Stall Business Analytics

The business calculator is deliberately tiered so the Free plan receives none of the new calculation feature:

| Plan | Business tools |
| --- | --- |
| Free | No expense records, historical reporting, or business calculator. Orders, menu, stock, and stall profile remain available. |
| Featured | Expense tracking plus revenue, net profit, profit margin, completed orders, items sold, average order value, and best seller, using quick date presets. Owners can send a Premium upgrade request without losing current Featured access. |
| Premium | Everything in Featured plus custom date ranges, gross-profit detail, performance summaries, sales/profit and expense charts, private menu costs, and menu-item profitability. |

Access begins only while a Featured or Premium subscription is paid, approved, enabled, and inside its scheduled start/end dates. The dashboard calculates revenue from completed, paid order items. In a multi-stall checkout, it includes only line items belonging to the signed-in stall, so another vendor's sales are never counted as that stall's revenue. Premium item-profit reports use private menu costs and cost snapshots captured when order items are created, so later menu-cost changes do not rewrite historical figures.

Apply the latest [`supabase/schema.sql`](supabase/schema.sql) before using this module. It adds stall-scoped expenses, private menu and order-item cost tables, completion timestamps, entitlement functions, row-level security, and a transactional Premium menu-and-cost save function. Expense access requires Featured or Premium; private cost access requires Premium. If old demo promotion records have expired, reactivate their paid schedule from the admin dashboard before testing.

Run `node scripts/test-business-entitlements.js`, `node scripts/test-business-store-security.js`, and `node scripts/test-business-analytics.js` to verify tier gating, private-data scoping, and the core multi-stall calculations. Bundled seed figures and browser `localStorage` are demonstration data only; real financial privacy and durable records require the Supabase schema and authenticated database policies.

## How Administrators Use the Web App

1. Sign in with the private administrator account.
2. Add or update food stalls.
3. Assign staff accounts to stalls.
4. Review promotion requests, confirm payment, and schedule sponsored placement.
5. Manage dining tables and QR codes.
6. Review orders and system activity.

Administrator and staff login details are private and are not provided in this repository.

## Promotion Demo

The repository includes Free, Featured (MYR 39/month), and Premium (MYR 79/month) example plans. Featured and Premium stalls appear in a separate **Sponsored stalls** area only when the campaign is active, marked paid, within its schedule, open, relevant to the current filter, and has orderable food. Organic results are ranked separately from a trusted, server-maintained 30-day popularity snapshot, with ratings as a fallback. Stale popularity snapshots are ignored after 48 hours so old figures do not keep influencing search.

This is an approval-flow prototype and does not collect real promotion payments. Before accepting real money, connect a hosted payment checkout, refresh `stall_popularity_metrics` from a trusted scheduled backend using server-verified orders, and activate campaigns only from a verified server-side payment webhook. Apply the latest [`supabase/schema.sql`](supabase/schema.sql) in Supabase before using the feature so its promotion tables, admin-only metrics policy, request function, and safe discovery aggregate are available. Until then, a configured Supabase deployment intentionally shows no demo-sponsored placements and cannot save promotion changes offline.
