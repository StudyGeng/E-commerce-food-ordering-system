# Multi-Vendor Food Ordering System

## Portfolio Summary

**Multi-Vendor Food Ordering System | HTML, CSS, JavaScript, Supabase**

- Developed a web platform for guest ordering from multiple food stalls with table QR access and payment status tracking.
- Tested with food stall owners and customers, helping simplify ordering, reduce waiting time, and minimize incorrect orders.

> Note: The summary above is the target portfolio wording after the system is completed and tested.

---

## Project Overview

This project is a web-based food ordering system for a food court or canteen with multiple food stalls. Customers scan a table QR code or barcode, browse stalls, view menus, add food items to a cart, place orders, choose card, e-wallet, or counter payment, and track order status.

Food stall owners or staff can receive live orders, update order progress, edit stall information, manage menu prices, and control food stock availability. Admin users can manage stalls, close or reopen stalls, delete stalls, manage staff/admin account details, and review system activity.

---

## Prototype Login Accounts

For local demo testing, use these prototype accounts:

| Role | Username | Password |
| --- | --- | --- |
| Staff | `staff` | `staff123` |
| Admin | `admin` | `admin123` |

Customers do not need to log in. They start from the scan page and can also enter a table code manually, such as `T04`.

---

## Main Objectives

- Simplify the ordering process for customers.
- Reduce waiting time at food stalls.
- Minimize incorrect or missed orders.
- Allow multiple food stalls to manage their own menus and orders.
- Allow customers to scan a table QR code before ordering.
- Record table information with every order.
- Let stall owners update food price, stock quantity, and availability.
- Let admins add, edit, close, reopen, or delete food stalls.
- Provide a simple digital ordering workflow using HTML, CSS, JavaScript, and Supabase.

---

## Tech Stack

### Frontend

- HTML
- CSS
- JavaScript

### Backend / Database

- Supabase Database
- Supabase REST API
- Supabase Realtime, optional
- Supabase Storage, optional for uploaded food images

### Payment

- Prototype card/e-wallet payment status for testing checkout.
- Counter payment e-bill for customers who choose to pay at the counter.

---

## User Roles

### Customer

- Order as a guest without registering or logging in.
- Scan the table QR code or barcode.
- Browse food stalls.
- View menu items.
- Add items to cart.
- Place an order.
- Choose card, e-wallet, or counter payment.
- Show a counter e-bill when paying at the counter.
- Track order status.
- View recent orders for the scanned table.

### Stall Owner / Staff

- Log in to staff dashboard.
- Receive live customer orders.
- Filter orders by stall.
- Edit stall profile information.
- Manage menu items.
- Update food price and stock quantity.
- Mark food as available or unavailable.
- View incoming orders.
- Update order status.
- Mark food as preparing, ready, or completed.

### Admin

- Manage food stalls.
- Add, edit, close, reopen, or delete food stalls.
- Manage staff and admin accounts.
- Update staff/admin account details when needed.
- Manage table QR ordering links.
- View all orders.
- Monitor system activity.

---

## Core Features

### Customer Features

- Browse multiple food stalls.
- Start from a table QR/barcode scan page.
- Search or filter menu items.
- Add menu items to cart.
- Update item quantity.
- Checkout with card, e-wallet, or counter e-bill.
- Receive order confirmation.
- Track order status in real time.
- Receive a warning if a pending order is not accepted after 10 minutes.
- View recent orders during the current visit or day.

### Stall Features

- Add, edit, and delete menu items.
- Edit stall name, cuisine type, image, description, wait time, and open/closed status.
- Update food price and stock quantity.
- Enable or disable menu availability.
- View new customer orders.
- Update order status.
- See delayed or auto-cancelled order alerts for the assigned stall.

### Admin Features

- Create and manage stall profiles.
- Close, reopen, and delete food stalls.
- Manage staff and admin accounts.
- Update admin or staff account information if login details need to change.
- View table QR ordering links.
- View order records.
- See delayed or auto-cancelled order issues for improvement review.
- Review sales and activity summaries.

---

## Supabase Database Design

### users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  username TEXT UNIQUE,
  demo_password TEXT,
  password_updated_at TIMESTAMP,
  role TEXT CHECK (role IN ('customer', 'staff', 'admin')) DEFAULT 'customer',
  assigned_stall_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

> Customers currently order as guests, so customer accounts are not required. Staff/admin login is a lightweight prototype login stored in this table. For production, passwords should be handled by Supabase Auth and stricter Row Level Security.

### tables

```sql
CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  seats INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### stalls

```sql
CREATE TABLE stalls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  cuisine_type TEXT,
  rating DECIMAL(3, 2) DEFAULT 0,
  staff_id UUID REFERENCES users(id),
  wait_minutes INTEGER DEFAULT 10,
  closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### menu_items

```sql
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stall_id UUID REFERENCES stalls(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  image_url TEXT,
  category TEXT,
  available BOOLEAN DEFAULT TRUE,
  stock_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### orders

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES users(id),
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  pickup_note TEXT,
  table_code TEXT,
  table_label TEXT,
  total_amount DECIMAL(10, 2) NOT NULL,
  status TEXT CHECK (status IN ('Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled')) DEFAULT 'Pending',
  payment_status TEXT CHECK (payment_status IN ('Pending', 'Paid', 'Failed')) DEFAULT 'Pending',
  payment_method TEXT DEFAULT 'Sandbox Card',
  transaction_id TEXT,
  pending_warning_at TIMESTAMP,
  auto_cancelled_at TIMESTAMP,
  cancellation_reason TEXT,
  stock_released_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### order_items

```sql
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id),
  stall_id UUID REFERENCES stalls(id),
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  notes TEXT
);
```

### payments

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  customer_id UUID REFERENCES users(id),
  amount DECIMAL(10, 2) NOT NULL,
  payment_method TEXT DEFAULT 'Sandbox',
  status TEXT CHECK (status IN ('Pending', 'Paid', 'Failed')) DEFAULT 'Pending',
  transaction_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

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
|-- supabase/
|   |-- schema.sql
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
|-- .env.example
|-- .gitignore
|-- README.md
```

> Note: The app is separated by role in `customer/`, `stall/`, and `admin/`. Shared configuration, starter data, Supabase helpers, and layout utilities are kept in `js/shared/`.

---

## Build For Upload

Copy `.env.example` to `.env`, then add your Supabase frontend connection values:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_REQUEST_TIMEOUT_MS=2500
```

Create the upload folder:

```bash
node scripts/build.js
```

Upload the generated `dist/` folder to Netlify, or connect GitHub to Netlify and let Netlify run the same build command.

The committed project does not include real Supabase values. `.env` is ignored by Git and must not be committed.

---

## Order History Retention

Customer order history is kept temporarily so a customer can place a second order during the same visit. Completed or cancelled customer orders are automatically removed from local browser storage after 40 minutes.

Pending orders are monitored during the ordering day. If an order stays `Pending` for more than 10 minutes, the customer sees a reminder to find the stall staff. If it is still not accepted after 15 minutes, the order is automatically cancelled, the payment is marked failed, and the issue remains visible to staff/admin until the normal history cleanup.

The retention period can be changed in `js/shared/config.js`:

```javascript
completedOrderRetentionMinutes: 40,
pendingOrderWarningMinutes: 10,
pendingOrderAutoCancelMinutes: 15
```

---

## Development Roadmap

### Phase 1: Project Setup

- Create HTML, CSS, and JavaScript file structure.
- Connect Supabase project.
- Set up environment configuration.
- Create database tables.

### Phase 2: Customer Ordering

- Build QR/barcode table scan page.
- Build stall browsing page.
- Build menu page.
- Build shopping cart.
- Build checkout page.
- Add card/e-wallet payment status and counter e-bill flow.

### Phase 3: Order Management

- Save orders to Supabase.
- Save order items.
- Save table code and table label with each order.
- Reduce food stock quantity after successful order placement.
- Show order confirmation.
- Add order tracking page.
- Keep customer-facing order history for a limited time only.
- Enable realtime order status updates.

### Phase 4: Staff Dashboard

- Build staff login flow.
- Show incoming orders.
- Allow staff to update order status.
- Add stall profile management.
- Add menu, price, stock, and availability management.

### Phase 5: Admin Dashboard

- Manage stalls.
- Manage staff and admin accounts.
- Manage staff/admin account details.
- Close, reopen, and delete stalls.
- Manage table QR links.
- View all orders.
- Show simple reports.

### Phase 6: Testing and Improvement

- Test customer ordering flow.
- Test stall owner order management flow.
- Collect feedback from food stall owners and customers.
- Improve usability based on feedback.

---

## Supabase Setup

1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase/schema.sql`.
3. Keep real project values out of `js/shared/config.js`.
4. For local testing, copy `.env.example` to `.env` and set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
5. For Netlify, set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in Netlify environment variables.
6. Only connect a live Supabase project after replacing the prototype login and public database policies.
7. Test customer scan, checkout, staff login, and admin login.
8. Enable Realtime for the `orders`, `order_items`, `menu_items`, and `stalls` tables if you want instant live updates.
9. Create table QR links from the admin dashboard before customers order.
10. Create a storage bucket for food and stall images if image upload is required.
11. Before production, replace the prototype password login and public policies with Supabase Auth and stricter Row Level Security.

## GitHub Safety

Safe to commit:

- Source HTML, CSS, and JavaScript files.
- `netlify.toml`, `_headers`, and `_redirects`.
- `.env.example`, because it contains empty placeholder values only.
- `supabase/schema.sql`, but only as a prototype database setup file.

Do not commit:

- `.env` or any `.env.*` file with real values.
- `dist/`, because it is generated by the Netlify build.
- Real passwords, service role keys, private API keys, or real payment credentials.

## Netlify Pre-Publish Security

Use the included Netlify build command:

```bash
node scripts/build.js
```

Netlify is configured to publish `dist/`, which includes only the app files and excludes development files such as `README.md` and `supabase/schema.sql`.

Before publishing for real users:

- Keep `js/shared/config.js` placeholders committed to GitHub.
- Add Supabase values through Netlify environment variables only after Supabase Auth and strict Row Level Security are ready.
- Do not store passwords in the `users` table.
- Do not allow `anon` users to select, insert, update, and delete every row in every table.
- Use real payment processing before accepting actual card or e-wallet payments.

---

## Success Criteria

- Customers can place an order from one or more food stalls.
- Customers can scan a table QR code before ordering.
- Table information is saved with the order.
- Orders are saved correctly in Supabase.
- Payment status is recorded.
- Stall staff can view and update incoming orders.
- Stall staff can edit stall details, food price, stock, and availability.
- Admin users can add, edit, close, reopen, and delete food stalls.
- Admin users can manage staff/admin account details and support password recovery.
- Customers can track order status.
- Customer order history does not remain for too long after the visit.
- The system is tested with both customers and food stall owners.
