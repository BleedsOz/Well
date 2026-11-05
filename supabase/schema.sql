-- Wellness Lab — σχήμα βάσης για Supabase
-- Τρέξε ολόκληρο το αρχείο στο Supabase → SQL Editor → New query → Run.

-- ───────────── Πίνακες ─────────────

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text not null default '',
  role        text not null default 'client' check (role in ('admin', 'client')),
  kcal        integer,
  protein     integer,
  carbs       integer,
  fat         integer,
  plan_days   integer not null default 7 check (plan_days between 1 and 14),
  notes       text not null default '',
  created_at  timestamptz not null default now()
);

-- Τρόφιμα: τιμές ανά 100 g (unit = 'g') ή ανά τεμάχιο (unit = 'piece')
create table if not exists public.foods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  unit        text not null default 'g' check (unit in ('g', 'piece')),
  kcal        numeric not null default 0 check (kcal >= 0),
  protein     numeric not null default 0 check (protein >= 0),
  carbs       numeric not null default 0 check (carbs >= 0),
  fat         numeric not null default 0 check (fat >= 0),
  created_at  timestamptz not null default now()
);

-- Γεύματα του προγράμματος: ένα γεύμα ανά (πελάτη, ημέρα, γεύμα της ημέρας)
-- items = [{ "food_id": "...", "amount": 150 }, ...]
create table if not exists public.meals (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles (id) on delete cascade,
  day         integer not null check (day between 1 and 14),
  slot        text not null check (slot in ('breakfast', 'snack1', 'lunch', 'snack2', 'dinner')),
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  updated_at  timestamptz not null default now(),
  unique (client_id, day, slot)
);

-- Τι επέλεξε ο πελάτης να φάει μια συγκεκριμένη ημερομηνία
create table if not exists public.selections (
  client_id   uuid not null references public.profiles (id) on delete cascade,
  date        date not null,
  slot        text not null check (slot in ('breakfast', 'snack1', 'lunch', 'snack2', 'dinner')),
  meal_id     uuid references public.meals (id) on delete set null,
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  done        boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (client_id, date, slot)
);

create index if not exists meals_client_idx on public.meals (client_id);
create index if not exists selections_client_date_idx on public.selections (client_id, date);

-- ───────────── Νέος χρήστης → προφίλ πελάτη ─────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── Ασφάλεια (Row Level Security) ─────────────

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles   enable row level security;
alter table public.foods      enable row level security;
alter table public.meals      enable row level security;
alter table public.selections enable row level security;

-- profiles: ο καθένας βλέπει το δικό του, η διατροφολόγος όλα. Μόνο η διατροφολόγος αλλάζει στόχους.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- foods: όλοι οι συνδεδεμένοι διαβάζουν, η διατροφολόγος επεξεργάζεται
drop policy if exists foods_select on public.foods;
create policy foods_select on public.foods for select to authenticated using (true);
drop policy if exists foods_write on public.foods;
create policy foods_write on public.foods for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- meals: ο πελάτης βλέπει το δικό του πρόγραμμα, η διατροφολόγος γράφει
drop policy if exists meals_select on public.meals;
create policy meals_select on public.meals for select to authenticated
  using (client_id = auth.uid() or public.is_admin());
drop policy if exists meals_write on public.meals;
create policy meals_write on public.meals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- selections: ο πελάτης διαχειρίζεται τις δικές του επιλογές, η διατροφολόγος τις βλέπει
drop policy if exists selections_select on public.selections;
create policy selections_select on public.selections for select to authenticated
  using (client_id = auth.uid() or public.is_admin());
drop policy if exists selections_insert on public.selections;
create policy selections_insert on public.selections for insert to authenticated
  with check (client_id = auth.uid());
drop policy if exists selections_update on public.selections;
create policy selections_update on public.selections for update to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists selections_delete on public.selections;
create policy selections_delete on public.selections for delete to authenticated
  using (client_id = auth.uid());

-- ───────────── Αρχικά τρόφιμα (ενδεικτικές τιμές, αλλάζουν από το admin) ─────────────

insert into public.foods (name, unit, kcal, protein, carbs, fat)
select * from (values
  ('Κοτόπουλο στήθος ψητό',          'g',     165, 31,   0,    3.6),
  ('Μοσχάρι άπαχο ψητό',             'g',     217, 26,   0,    12),
  ('Σολομός ψητός',                  'g',     206, 22,   0,    12),
  ('Τόνος σε νερό',                  'g',     116, 26,   0,    1),
  ('Φασολάκια λαδερά',               'g',     95,  2,    8,    6.5),
  ('Φακές βρασμένες',                'g',     116, 9,    20,   0.4),
  ('Ρεβίθια βρασμένα',               'g',     164, 8.9,  27,   2.6),
  ('Ρύζι βρασμένο',                  'g',     130, 2.7,  28,   0.3),
  ('Ζυμαρικά βρασμένα',              'g',     158, 5.8,  31,   0.9),
  ('Πατάτα βραστή',                  'g',     87,  1.9,  20,   0.1),
  ('Μπρόκολο βραστό',                'g',     35,  2.4,  7,    0.4),
  ('Σαλάτα εποχής (χωρίς λάδι)',     'g',     20,  1,    4,    0.2),
  ('Φέτα',                           'g',     264, 14,   4,    21),
  ('Γιαούρτι στραγγιστό 2%',         'g',     73,  10,   3.6,  2),
  ('Τυρί cottage',                   'g',     98,  11,   3.4,  4.3),
  ('Γάλα 1,5%',                      'g',     47,  3.4,  4.9,  1.5),
  ('Βρώμη',                          'g',     389, 16.9, 66,   6.9),
  ('Ψωμί ολικής άλεσης',             'g',     247, 13,   41,   3.4),
  ('Ελαιόλαδο',                      'g',     884, 0,    0,    100),
  ('Μέλι',                           'g',     304, 0.3,  82,   0),
  ('Καρύδια',                        'g',     654, 15,   14,   65),
  ('Αμύγδαλα',                       'g',     579, 21,   22,   50),
  ('Αυγό',                           'piece', 72,  6.3,  0.4,  4.8),
  ('Τοστ (ψωμί, γαλοπούλα, τυρί)',   'piece', 300, 18,   30,   11),
  ('Μήλο',                           'piece', 95,  0.5,  25,   0.3),
  ('Μπανάνα',                        'piece', 105, 1.3,  27,   0.4),
  ('Πορτοκάλι',                      'piece', 62,  1.2,  15,   0.2),
  ('Πουτίγκα light (κεσεδάκι)',      'piece', 110, 3.5,  18,   2.5),
  ('Φρυγανιά ολικής',                'piece', 35,  1.3,  6,    0.6),
  ('Ρυζογκοφρέτα',                   'piece', 35,  0.7,  7.3,  0.3)
) as v(name, unit, kcal, protein, carbs, fat)
where not exists (select 1 from public.foods);

-- ───────────── Κάνε τη διατροφολόγο admin ─────────────
-- Αφού φτιάξει λογαριασμό από τη σελίδα εγγραφής, τρέξε (με το δικό της email):
--   update public.profiles set role = 'admin' where email = 'to-email-tis@example.com';
