create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text unique,
  phone text,
  username text unique,
  role text not null default 'customer' check (role in ('customer', 'staff', 'admin')),
  assigned_stall_id uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text not null,
  seats integer default 0,
  active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.stalls (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  cuisine_type text,
  rating numeric(3, 2) default 0,
  staff_id uuid references public.users(id) on delete set null,
  wait_minutes integer default 10,
  closed boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.users
  drop constraint if exists users_assigned_stall_id_fkey;

alter table public.users
  add constraint users_assigned_stall_id_fkey
  foreign key (assigned_stall_id) references public.stalls(id) on delete set null;

delete from public.users u
where not exists (select 1 from auth.users au where au.id = u.id);

alter table public.users drop constraint if exists users_id_fkey;
alter table public.users
  add constraint users_id_fkey foreign key (id) references auth.users(id) on delete cascade;

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid references public.stalls(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10, 2) not null,
  image_url text,
  category text,
  available boolean default true,
  stock_quantity integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.users(id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  pickup_note text,
  table_code text,
  table_label text,
  total_amount numeric(10, 2) not null,
  status text default 'Pending' check (status in ('Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled')),
  payment_status text default 'Pending' check (payment_status in ('Pending', 'Paid', 'Failed')),
  payment_method text default 'Sandbox Card',
  transaction_id text,
  pending_warning_at timestamp with time zone,
  auto_cancelled_at timestamp with time zone,
  cancellation_reason text,
  stock_released_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  stall_id uuid references public.stalls(id) on delete set null,
  quantity integer not null,
  price numeric(10, 2) not null,
  notes text
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  customer_id uuid references public.users(id) on delete set null,
  amount numeric(10, 2) not null,
  payment_method text default 'Sandbox',
  status text default 'Pending' check (status in ('Pending', 'Paid', 'Failed')),
  transaction_id text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.users add column if not exists assigned_stall_id uuid;

-- Passwords belong exclusively to Supabase Auth. Remove legacy prototype secrets.
alter table public.users drop column if exists demo_password;
alter table public.users drop column if exists password_updated_at;

alter table public.orders add column if not exists payment_method text default 'Sandbox Card';
alter table public.orders add column if not exists transaction_id text;
alter table public.orders add column if not exists pending_warning_at timestamp with time zone;
alter table public.orders add column if not exists auto_cancelled_at timestamp with time zone;
alter table public.orders add column if not exists cancellation_reason text;
alter table public.orders add column if not exists stock_released_at timestamp with time zone;

alter table public.payments add column if not exists updated_at timestamp with time zone default now();

create index if not exists idx_menu_items_stall_id on public.menu_items(stall_id);
create index if not exists idx_menu_items_category on public.menu_items(category);
create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_table_code on public.orders(table_code);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_order_items_stall_id on public.order_items(stall_id);
create index if not exists idx_payments_order_id on public.payments(order_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists set_tables_updated_at on public.tables;
create trigger set_tables_updated_at
  before update on public.tables
  for each row execute function public.set_updated_at();

drop trigger if exists set_stalls_updated_at on public.stalls;
create trigger set_stalls_updated_at
  before update on public.stalls
  for each row execute function public.set_updated_at();

drop trigger if exists set_menu_items_updated_at on public.menu_items;
create trigger set_menu_items_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

insert into public.stalls (id, name, description, image_url, cuisine_type, rating, staff_id, wait_minutes, closed)
values
  ('10000000-0000-4000-8000-000000000001', 'Nasi Corner', 'Comfort rice plates with quick lunch sets.', 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=80', 'Rice', 4.7, null, 12, false),
  ('10000000-0000-4000-8000-000000000002', 'Wok Noodle Bar', 'Hot noodles, soup bowls, and wok-fried specials.', 'https://images.unsplash.com/photo-1552611052-33e04de081de?auto=format&fit=crop&w=900&q=80', 'Noodles', 4.5, null, 10, false),
  ('10000000-0000-4000-8000-000000000003', 'Grill Station', 'Burgers, satay, and grilled snacks.', 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80', 'Grill', 4.6, null, 15, false),
  ('10000000-0000-4000-8000-000000000004', 'Fresh Sip', 'Cold drinks, tea, coffee, and desserts.', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=80', 'Drinks', 4.8, null, 5, false)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine_type = excluded.cuisine_type,
  rating = excluded.rating,
  wait_minutes = excluded.wait_minutes,
  closed = excluded.closed;

insert into public.menu_items (id, stall_id, name, description, price, image_url, category, available, stock_quantity)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Hainan Chicken Rice', 'Steamed chicken, fragrant rice, soup, cucumber, and chili sauce.', 8.90, 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=80', 'Rice', true, 18),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Nasi Lemak Ayam', 'Coconut rice with fried chicken, sambal, egg, peanuts, and cucumber.', 10.50, 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=900&q=80', 'Rice', true, 14),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Curry Rice Set', 'Rice bowl with chicken curry, vegetables, and crispy papadum.', 9.80, 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=900&q=80', 'Rice', true, 10),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'Char Kuey Teow', 'Wok-fried flat rice noodles with egg, prawns, and bean sprouts.', 9.50, 'https://images.unsplash.com/photo-1552611052-33e04de081de?auto=format&fit=crop&w=900&q=80', 'Noodles', true, 16),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'Dry Pan Mee', 'Handmade noodles with minced chicken, anchovies, egg, and chili.', 8.50, 'https://images.unsplash.com/photo-1626804475297-41608ea09aeb?auto=format&fit=crop&w=900&q=80', 'Noodles', true, 12),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'Curry Laksa', 'Rich curry noodle soup with tofu puff, chicken, and vegetables.', 10.20, 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80', 'Noodles', true, 9),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003', 'Classic Beef Burger', 'Grilled beef patty, cheddar, lettuce, tomato, onion, and house sauce.', 12.90, 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80', 'Grill', true, 11),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000003', 'Chicken Satay Set', 'Six skewers with peanut sauce, cucumber, onion, and rice cake.', 11.40, 'https://images.unsplash.com/photo-1529563021893-cc83c992d75d?auto=format&fit=crop&w=900&q=80', 'Grill', true, 20),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000003', 'Grilled Chicken Salad', 'Greens, grilled chicken, cherry tomatoes, corn, and sesame dressing.', 10.90, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80', 'Healthy', true, 8),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000004', 'Iced Lemon Tea', 'Freshly brewed tea with lemon and light syrup.', 3.90, 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=80', 'Drinks', true, 30),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000004', 'Brown Sugar Milk Tea', 'Cold milk tea with brown sugar syrup and pearls.', 6.50, 'https://images.unsplash.com/photo-1558857563-b371033873b8?auto=format&fit=crop&w=900&q=80', 'Drinks', true, 15),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000004', 'Mango Dessert Cup', 'Mango, cream, sago pearls, and chilled jelly cubes.', 7.20, 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=80', 'Dessert', true, 7)
on conflict (id) do update set
  stall_id = excluded.stall_id,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  image_url = excluded.image_url,
  category = excluded.category,
  available = excluded.available,
  stock_quantity = excluded.stock_quantity;

insert into public.tables (id, code, label, seats, active)
values
  ('30000000-0000-4000-8000-000000000001', 'T01', 'Table 1', 2, true),
  ('30000000-0000-4000-8000-000000000002', 'T02', 'Table 2', 4, true),
  ('30000000-0000-4000-8000-000000000003', 'T03', 'Table 3', 4, true),
  ('30000000-0000-4000-8000-000000000004', 'T04', 'Table 4', 6, true),
  ('30000000-0000-4000-8000-000000000005', 'T05', 'Table 5', 2, true),
  ('30000000-0000-4000-8000-000000000006', 'COUNTER', 'Counter pickup', 0, true)
on conflict (id) do update set
  code = excluded.code,
  label = excluded.label,
  seats = excluded.seats,
  active = excluded.active;

alter table public.users enable row level security;
alter table public.tables enable row level security;
alter table public.stalls enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

revoke all on public.users, public.tables, public.stalls, public.menu_items,
  public.orders, public.order_items, public.payments from anon, authenticated;

grant select on public.tables, public.stalls, public.menu_items to anon, authenticated;
grant insert on public.orders, public.order_items, public.payments to anon, authenticated;
grant select on public.orders, public.order_items, public.payments to anon, authenticated;
grant select, insert, update, delete on public.users, public.tables, public.stalls, public.menu_items to authenticated;
grant update (status, payment_status, pending_warning_at, auto_cancelled_at,
  cancellation_reason, stock_released_at, updated_at) on public.orders to authenticated;
grant update (status, updated_at) on public.payments to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.assigned_stall()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select assigned_stall_id from public.users where id = auth.uid() and role = 'staff';
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.assigned_stall() from public;
grant execute on function public.is_admin(), public.assigned_stall() to authenticated;

drop policy if exists "Prototype public access" on public.users;
drop policy if exists "Prototype public access" on public.tables;
drop policy if exists "Prototype public access" on public.stalls;
drop policy if exists "Prototype public access" on public.menu_items;
drop policy if exists "Prototype public access" on public.orders;
drop policy if exists "Prototype public access" on public.order_items;
drop policy if exists "Prototype public access" on public.payments;

drop policy if exists "Users read own or admin" on public.users;
drop policy if exists "Admins create users" on public.users;
drop policy if exists "Admins update users" on public.users;
drop policy if exists "Public reads tables" on public.tables;
drop policy if exists "Admins manage tables" on public.tables;
drop policy if exists "Public reads stalls" on public.stalls;
drop policy if exists "Admins create stalls" on public.stalls;
drop policy if exists "Admins delete stalls" on public.stalls;
drop policy if exists "Assigned staff update stall" on public.stalls;
drop policy if exists "Public reads menu" on public.menu_items;
drop policy if exists "Assigned staff create menu" on public.menu_items;
drop policy if exists "Assigned staff update menu" on public.menu_items;
drop policy if exists "Assigned staff delete menu" on public.menu_items;
drop policy if exists "Customers create orders" on public.orders;
drop policy if exists "Order tracking reads orders" on public.orders;
drop policy if exists "Assigned staff update orders" on public.orders;
drop policy if exists "Customers create order items" on public.order_items;
drop policy if exists "Order tracking reads order items" on public.order_items;
drop policy if exists "Customers create payments" on public.payments;
drop policy if exists "Order tracking reads payments" on public.payments;
drop policy if exists "Assigned staff update payments" on public.payments;

create policy "Users read own or admin" on public.users for select to authenticated
using (id = auth.uid() or public.is_admin());
create policy "Admins create users" on public.users for insert to authenticated
with check (public.is_admin() and role in ('staff', 'admin'));
create policy "Admins update users" on public.users for update to authenticated
using (public.is_admin()) with check (public.is_admin() and role in ('staff', 'admin'));

create policy "Public reads tables" on public.tables for select to anon, authenticated using (true);
create policy "Admins manage tables" on public.tables for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Public reads stalls" on public.stalls for select to anon, authenticated using (true);
create policy "Admins create stalls" on public.stalls for insert to authenticated with check (public.is_admin());
create policy "Admins delete stalls" on public.stalls for delete to authenticated using (public.is_admin());
create policy "Assigned staff update stall" on public.stalls for update to authenticated
using (public.is_admin() or id = public.assigned_stall())
with check (public.is_admin() or id = public.assigned_stall());

create policy "Public reads menu" on public.menu_items for select to anon, authenticated using (true);
create policy "Assigned staff create menu" on public.menu_items for insert to authenticated
with check (public.is_admin() or stall_id = public.assigned_stall());
create policy "Assigned staff update menu" on public.menu_items for update to authenticated
using (public.is_admin() or stall_id = public.assigned_stall())
with check (public.is_admin() or stall_id = public.assigned_stall());
create policy "Assigned staff delete menu" on public.menu_items for delete to authenticated
using (public.is_admin() or stall_id = public.assigned_stall());

create policy "Customers create orders" on public.orders for insert to anon, authenticated with check (true);
create policy "Order tracking reads orders" on public.orders for select to anon, authenticated using (true);
create policy "Assigned staff update orders" on public.orders for update to authenticated
using (public.is_admin() or exists (
  select 1 from public.order_items oi where oi.order_id = orders.id and oi.stall_id = public.assigned_stall()
));

create policy "Customers create order items" on public.order_items for insert to anon, authenticated with check (true);
create policy "Order tracking reads order items" on public.order_items for select to anon, authenticated using (true);

create policy "Customers create payments" on public.payments for insert to anon, authenticated with check (true);
create policy "Order tracking reads payments" on public.payments for select to anon, authenticated using (true);
create policy "Assigned staff update payments" on public.payments for update to authenticated
using (public.is_admin() or exists (
  select 1 from public.order_items oi where oi.order_id = payments.order_id and oi.stall_id = public.assigned_stall()
));

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.order_items;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.menu_items;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.stalls;
exception when duplicate_object then
  null;
end $$;
