create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  phone text,
  username text unique,
  demo_password text,
  password_updated_at timestamp with time zone,
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

alter table public.users add column if not exists demo_password text;
alter table public.users add column if not exists password_updated_at timestamp with time zone;
alter table public.users add column if not exists assigned_stall_id uuid;

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

insert into public.users (id, name, email, phone, username, demo_password, password_updated_at, role, assigned_stall_id)
values
  ('00000000-0000-4000-8000-000000000002', 'Food Stall Owner', 'staff@example.com', '0123388771', 'staff', 'staff123', now(), 'staff', null),
  ('00000000-0000-4000-8000-000000000003', 'Admin User', 'admin@example.com', '0120000000', 'admin', 'admin123', now(), 'admin', null)
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  phone = excluded.phone,
  username = excluded.username,
  role = excluded.role,
  demo_password = coalesce(nullif(public.users.demo_password, ''), excluded.demo_password),
  password_updated_at = coalesce(public.users.password_updated_at, excluded.password_updated_at);

delete from public.users
where role = 'customer';

insert into public.stalls (id, name, description, image_url, cuisine_type, rating, staff_id, wait_minutes, closed)
values
  ('10000000-0000-4000-8000-000000000001', 'Nasi Corner', 'Comfort rice plates with quick lunch sets.', 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=80', 'Rice', 4.7, '00000000-0000-4000-8000-000000000002', 12, false),
  ('10000000-0000-4000-8000-000000000002', 'Wok Noodle Bar', 'Hot noodles, soup bowls, and wok-fried specials.', 'https://images.unsplash.com/photo-1552611052-33e04de081de?auto=format&fit=crop&w=900&q=80', 'Noodles', 4.5, '00000000-0000-4000-8000-000000000002', 10, false),
  ('10000000-0000-4000-8000-000000000003', 'Grill Station', 'Burgers, satay, and grilled snacks.', 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80', 'Grill', 4.6, '00000000-0000-4000-8000-000000000002', 15, false),
  ('10000000-0000-4000-8000-000000000004', 'Fresh Sip', 'Cold drinks, tea, coffee, and desserts.', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=80', 'Drinks', 4.8, '00000000-0000-4000-8000-000000000002', 5, false)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine_type = excluded.cuisine_type,
  rating = excluded.rating,
  staff_id = excluded.staff_id,
  wait_minutes = excluded.wait_minutes,
  closed = excluded.closed;

update public.users
set assigned_stall_id = '10000000-0000-4000-8000-000000000001'
where id = '00000000-0000-4000-8000-000000000002';

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

grant select, insert, update, delete on
  public.users,
  public.tables,
  public.stalls,
  public.menu_items,
  public.orders,
  public.order_items,
  public.payments
to anon, authenticated;

drop policy if exists "Prototype public access" on public.users;
drop policy if exists "Prototype public access" on public.tables;
drop policy if exists "Prototype public access" on public.stalls;
drop policy if exists "Prototype public access" on public.menu_items;
drop policy if exists "Prototype public access" on public.orders;
drop policy if exists "Prototype public access" on public.order_items;
drop policy if exists "Prototype public access" on public.payments;

create policy "Prototype public access" on public.users for all to anon, authenticated using (true) with check (true);
create policy "Prototype public access" on public.tables for all to anon, authenticated using (true) with check (true);
create policy "Prototype public access" on public.stalls for all to anon, authenticated using (true) with check (true);
create policy "Prototype public access" on public.menu_items for all to anon, authenticated using (true) with check (true);
create policy "Prototype public access" on public.orders for all to anon, authenticated using (true) with check (true);
create policy "Prototype public access" on public.order_items for all to anon, authenticated using (true) with check (true);
create policy "Prototype public access" on public.payments for all to anon, authenticated using (true) with check (true);

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
