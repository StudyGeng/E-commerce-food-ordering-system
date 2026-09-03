# E-commerce Food Ordering System

A responsive multi-vendor food ordering system for food courts, canteens, and small dining areas. Customers scan a table QR code, browse food from multiple stalls, add items to one cart, choose a payment method, and track their order. Stall staff receive orders, confirm counter payments, update order progress, and manage menu items. Admin users manage stalls, accounts, tables, and QR ordering links.

This project is built with HTML, CSS, JavaScript, and Supabase. It can be deployed as a static site on Netlify.

## Features

- Table QR/code ordering for dine-in customers.
- Guest customer ordering without account registration.
- Multi-vendor stall browsing and menu ordering.
- Cart with quantity control and item notes.
- Checkout with prototype card, e-wallet, and pay-at-counter options.
- Counter e-bill/receipt for pay-at-counter orders.
- Staff payment confirmation before receiving counter-payment orders.
- Simple order progress flow: Pending, Received, Completed.
- Staff dashboard for incoming orders, stall profile, menu prices, stock, and availability.
- Admin dashboard for stalls, staff/admin accounts, tables, QR codes, and order records.
- Supabase database support with local fallback demo data.
- Netlify-ready build output through `scripts/build.js`.

## User Roles

### Customer

Customers start by scanning or entering a table code. After table access is confirmed, they can browse stalls, order food, checkout, and track order status.

Main customer pages:

- `customer/scan.html`
- `customer/index.html`
- `customer/cart.html`
- `customer/checkout.html`
- `customer/orders.html`

### Food Stall Staff

Staff members manage one assigned stall. They can receive orders, confirm counter payments, complete orders, edit stall details, and maintain food/menu information.

Main staff page:

- `stall/index.html`

### Admin

Admins manage the food court setup. They can create and edit stalls, assign staff accounts, manage table QR codes, and review order activity.

Main admin page:

- `admin/index.html`

## Account Management

Customer accounts are not required. Customers can scan a table QR code or enter a table code, then start ordering as guests.

Admin and food stall staff accounts should be created and managed by the system owner. The admin dashboard can be used to add staff/admin accounts, update account details, and assign a food stall to a staff account.

For public repositories, do not publish real admin or stall owner usernames and passwords in the README. Keep login credentials private and share them only with authorized users.

## How The System Works

1. Admin creates or manages table QR codes.
2. Customer scans a table QR code.
3. Customer chooses food from available stalls.
4. Customer adds food to cart and checks out.
5. If payment is card or e-wallet, the prototype marks the order as paid.
6. If payment is pay-at-counter, the customer receives an e-bill.
7. Staff confirms counter payment before receiving the order.
8. Staff receives the order.
9. Staff completes the order when it is done.
10. Customer tracks the latest order status from the order page.

## Project Structure

```text
food_ordering/
|-- index.html
|-- 404.html
|-- _headers
|-- _redirects
|-- netlify.toml
|-- main/
|   |-- login.html
|-- customer/
|   |-- scan.html
|   |-- index.html
|   |-- cart.html
|   |-- checkout.html
|   |-- orders.html
|-- stall/
|   |-- index.html
|-- admin/
|   |-- index.html
|-- css/
|   |-- style.css
|-- js/
|   |-- shared/
|   |   |-- config.js
|   |   |-- data.js
|   |   |-- supabase.js
|   |   |-- app.js
|   |   |-- login.js
|   |-- customer/
|   |   |-- scan.js
|   |   |-- menu.js
|   |   |-- cart.js
|   |   |-- checkout.js
|   |   |-- orders.js
|   |-- stall/
|   |   |-- staff.js
|   |-- admin/
|   |   |-- admin.js
|-- scripts/
|   |-- build.js
|-- supabase/
|   |-- schema.sql
|-- .env.example
|-- .gitignore
|-- README.md
```

## Local Setup

Clone the repository:

```bash
git clone https://github.com/StudyGeng/E-commerce-food-ordering-system.git
cd E-commerce-food-ordering-system
```

Create a local environment file:

```bash
cp .env.example .env
```

Add your Supabase frontend values to `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_REQUEST_TIMEOUT_MS=2500
```

Build the deploy folder:

```bash
node scripts/build.js
```

The generated site will be placed in:

```text
dist/
```

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run the SQL file in `supabase/schema.sql`.
4. Copy `.env.example` to `.env`.
5. Add your Supabase URL and publishable key.
6. Run `node scripts/build.js`.
7. Open or deploy the generated `dist/` folder.

The schema includes prototype tables for:

- users
- tables
- stalls
- menu_items
- orders
- order_items
- payments

## Netlify Deployment

This project includes `netlify.toml`:

```toml
[build]
  command = "node scripts/build.js"
  publish = "dist"
```

There are two deployment options.

### Option 1: Manual Upload

Run:

```bash
node scripts/build.js
```

Then upload the `dist/` folder to Netlify.

### Option 2: GitHub Connected Deployment

Connect this GitHub repository to Netlify. Netlify will run the build command and publish `dist/`.

In Netlify project settings, add these environment variables:

```env
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_REQUEST_TIMEOUT_MS
```

Do not upload `.env` to GitHub or Netlify manually.

## Important Security Notes

This is a prototype/demo system. Before using it in production:

- Replace demo password login with Supabase Auth.
- Do not store real passwords in database tables.
- Do not expose service role keys in frontend code.
- Review and restrict Supabase Row Level Security policies.
- Use a real payment provider for real card or e-wallet payments.
- Keep `.env` private and never commit it to GitHub.

## GitHub Upload Notes

Safe to commit:

- Source HTML, CSS, and JavaScript files.
- `scripts/build.js`
- `supabase/schema.sql`
- `netlify.toml`
- `_headers`
- `_redirects`
- `.env.example`
- `.gitignore`
- `README.md`

Do not commit:

- `.env`
- `dist/`
- `node_modules/`
- `.netlify/`
- Real API keys or private credentials

## Main Technologies

- HTML
- CSS
- JavaScript
- Supabase
- Netlify

## License

No license has been selected yet. If you want others to use, modify, or share this project, add a license such as MIT.
