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

Each staff account can access only its assigned stall.

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
