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

-- ───────────── Επεκτάσεις (v2): συνταγές, κατηγορίες, μετρήσεις, νερό, πρότυπα ─────────────

-- Στοιχεία πελάτη για πρόταση θερμίδων
alter table public.profiles add column if not exists sex        text check (sex in ('male', 'female'));
alter table public.profiles add column if not exists birth_year integer check (birth_year between 1900 and 2100);
alter table public.profiles add column if not exists height_cm  numeric check (height_cm between 50 and 250);
alter table public.profiles add column if not exists activity   numeric check (activity between 1 and 2.5);
alter table public.profiles add column if not exists goal       text check (goal in ('lose', 'maintain', 'gain'));

-- Κατηγορία τροφίμου (για εναλλακτικά/ισοδύναμα)
alter table public.foods add column if not exists category text not null default '';

-- Συνταγή ανά γεύμα
alter table public.meals add column if not exists title     text not null default '';
alter table public.meals add column if not exists recipe    text not null default '';
alter table public.meals add column if not exists photo_url text not null default '';
alter table public.meals add column if not exists recipe_url text not null default '';

-- Μετρήσεις σώματος (λιπομέτρηση ή καταγραφή από τον πελάτη)
create table if not exists public.measurements (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.profiles (id) on delete cascade,
  date            date not null,
  source          text not null default 'admin' check (source in ('admin', 'client', 'import')),
  weight          numeric,
  fat_pct         numeric,
  fat_kg          numeric,
  muscle_kg       numeric,
  water_pct       numeric,
  visceral_fat    numeric,
  bone_kg         numeric,
  bmr             numeric,
  metabolic_age   numeric,
  bmi             numeric,
  waist_cm        numeric,
  hip_cm          numeric,
  notes           text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists measurements_client_date_idx on public.measurements (client_id, date);

-- Νερό & σημειώσεις ημέρας
create table if not exists public.day_logs (
  client_id   uuid not null references public.profiles (id) on delete cascade,
  date        date not null,
  water_ml    integer not null default 0 check (water_ml between 0 and 10000),
  notes       text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (client_id, date)
);

-- Πρότυπα προγραμμάτων. meals = [{ day, slot, items, title, recipe, photo_url }]
create table if not exists public.templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kcal        integer,
  protein     integer,
  carbs       integer,
  fat         integer,
  plan_days   integer not null default 7 check (plan_days between 1 and 14),
  meals       jsonb not null default '[]'::jsonb check (jsonb_typeof(meals) = 'array'),
  created_at  timestamptz not null default now()
);

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

alter table public.measurements enable row level security;
alter table public.day_logs     enable row level security;
alter table public.templates    enable row level security;

-- measurements: η διατροφολόγος όλα· ο πελάτης βλέπει τις δικές του και διαχειρίζεται όσες έβαλε ο ίδιος
drop policy if exists measurements_select on public.measurements;
create policy measurements_select on public.measurements for select to authenticated
  using (client_id = auth.uid() or public.is_admin());
drop policy if exists measurements_admin on public.measurements;
create policy measurements_admin on public.measurements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists measurements_client_insert on public.measurements;
create policy measurements_client_insert on public.measurements for insert to authenticated
  with check (client_id = auth.uid() and source = 'client');
drop policy if exists measurements_client_update on public.measurements;
create policy measurements_client_update on public.measurements for update to authenticated
  using (client_id = auth.uid() and source = 'client') with check (client_id = auth.uid() and source = 'client');
drop policy if exists measurements_client_delete on public.measurements;
create policy measurements_client_delete on public.measurements for delete to authenticated
  using (client_id = auth.uid() and source = 'client');

-- day_logs: ο πελάτης τα δικά του, η διατροφολόγος τα βλέπει
drop policy if exists day_logs_select on public.day_logs;
create policy day_logs_select on public.day_logs for select to authenticated
  using (client_id = auth.uid() or public.is_admin());
drop policy if exists day_logs_write on public.day_logs;
create policy day_logs_write on public.day_logs for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());

-- templates: μόνο η διατροφολόγος
drop policy if exists templates_admin on public.templates;
create policy templates_admin on public.templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Φωτογραφίες συνταγών (Supabase Storage): δημόσια ανάγνωση, ανέβασμα μόνο από τη διατροφολόγο
insert into storage.buckets (id, name, public) values ('recipes', 'recipes', true)
on conflict (id) do nothing;
drop policy if exists recipes_admin_write on storage.objects;
create policy recipes_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'recipes' and public.is_admin())
  with check (bucket_id = 'recipes' and public.is_admin());

-- ───────────── Αρχικά τρόφιμα (ενδεικτικές τιμές, αλλάζουν από το admin) ─────────────

-- Προσθέτει όσα λείπουν (με βάση το όνομα) και συμπληρώνει κατηγορία όπου είναι κενή.
insert into public.foods (name, unit, kcal, protein, carbs, fat, category)
select v.* from (values
  ('Κοτόπουλο στήθος ψητό', 'g', 165, 31, 0, 3.6, 'Κρέας, ψάρι, αυγά'),
  ('Γαλοπούλα φιλέτο ψητό', 'g', 135, 30, 0, 1.5, 'Κρέας, ψάρι, αυγά'),
  ('Μοσχάρι άπαχο ψητό', 'g', 217, 26, 0, 12, 'Κρέας, ψάρι, αυγά'),
  ('Χοιρινό άπαχο ψητό', 'g', 200, 29, 0, 9, 'Κρέας, ψάρι, αυγά'),
  ('Σολομός ψητός', 'g', 206, 22, 0, 12, 'Κρέας, ψάρι, αυγά'),
  ('Μπακαλιάρος ψητός', 'g', 105, 23, 0, 0.9, 'Κρέας, ψάρι, αυγά'),
  ('Τόνος σε νερό', 'g', 116, 26, 0, 1, 'Κρέας, ψάρι, αυγά'),
  ('Αυγό', 'piece', 72, 6.3, 0.4, 4.8, 'Κρέας, ψάρι, αυγά'),
  ('Φασολάκια λαδερά', 'g', 95, 2, 8, 6.5, 'Μαγειρευτά'),
  ('Φακές βρασμένες', 'g', 116, 9, 20, 0.4, 'Όσπρια'),
  ('Ρεβίθια βρασμένα', 'g', 164, 8.9, 27, 2.6, 'Όσπρια'),
  ('Ρύζι βρασμένο', 'g', 130, 2.7, 28, 0.3, 'Αμυλούχα'),
  ('Ζυμαρικά βρασμένα', 'g', 158, 5.8, 31, 0.9, 'Αμυλούχα'),
  ('Κινόα βρασμένη', 'g', 120, 4.4, 21, 1.9, 'Αμυλούχα'),
  ('Πατάτα βραστή', 'g', 87, 1.9, 20, 0.1, 'Αμυλούχα'),
  ('Γλυκοπατάτα ψητή', 'g', 90, 2, 21, 0.1, 'Αμυλούχα'),
  ('Βρώμη', 'g', 389, 16.9, 66, 6.9, 'Αμυλούχα'),
  ('Ψωμί ολικής άλεσης', 'g', 247, 13, 41, 3.4, 'Αμυλούχα'),
  ('Φρυγανιά ολικής', 'piece', 35, 1.3, 6, 0.6, 'Αμυλούχα'),
  ('Ρυζογκοφρέτα', 'piece', 35, 0.7, 7.3, 0.3, 'Αμυλούχα'),
  ('Μπρόκολο βραστό', 'g', 35, 2.4, 7, 0.4, 'Λαχανικά'),
  ('Σαλάτα εποχής (χωρίς λάδι)', 'g', 20, 1, 4, 0.2, 'Λαχανικά'),
  ('Φέτα', 'g', 264, 14, 4, 21, 'Γαλακτοκομικά'),
  ('Γιαούρτι στραγγιστό 2%', 'g', 73, 10, 3.6, 2, 'Γαλακτοκομικά'),
  ('Τυρί cottage', 'g', 98, 11, 3.4, 4.3, 'Γαλακτοκομικά'),
  ('Γάλα 1,5%', 'g', 47, 3.4, 4.9, 1.5, 'Γαλακτοκομικά'),
  ('Ελαιόλαδο', 'g', 884, 0, 0, 100, 'Λιπαρά & ξηροί καρποί'),
  ('Καρύδια', 'g', 654, 15, 14, 65, 'Λιπαρά & ξηροί καρποί'),
  ('Αμύγδαλα', 'g', 579, 21, 22, 50, 'Λιπαρά & ξηροί καρποί'),
  ('Φυστικοβούτυρο', 'g', 588, 25, 20, 50, 'Λιπαρά & ξηροί καρποί'),
  ('Μήλο', 'piece', 95, 0.5, 25, 0.3, 'Φρούτα'),
  ('Μπανάνα', 'piece', 105, 1.3, 27, 0.4, 'Φρούτα'),
  ('Πορτοκάλι', 'piece', 62, 1.2, 15, 0.2, 'Φρούτα'),
  ('Αχλάδι', 'piece', 100, 0.6, 27, 0.2, 'Φρούτα'),
  ('Ακτινίδιο', 'piece', 42, 0.8, 10, 0.4, 'Φρούτα'),
  ('Μέλι', 'g', 304, 0.3, 82, 0, 'Σνακ & γλυκά'),
  ('Τοστ (ψωμί, γαλοπούλα, τυρί)', 'piece', 300, 18, 30, 11, 'Σνακ & γλυκά'),
  ('Πουτίγκα light (κεσεδάκι)', 'piece', 110, 3.5, 18, 2.5, 'Σνακ & γλυκά')
) as v(name, unit, kcal, protein, carbs, fat, category)
where not exists (select 1 from public.foods f where f.name = v.name);

update public.foods f set category = v.category
from (values
  ('Κοτόπουλο στήθος ψητό', 'Κρέας, ψάρι, αυγά'),
  ('Γαλοπούλα φιλέτο ψητό', 'Κρέας, ψάρι, αυγά'),
  ('Μοσχάρι άπαχο ψητό', 'Κρέας, ψάρι, αυγά'),
  ('Χοιρινό άπαχο ψητό', 'Κρέας, ψάρι, αυγά'),
  ('Σολομός ψητός', 'Κρέας, ψάρι, αυγά'),
  ('Μπακαλιάρος ψητός', 'Κρέας, ψάρι, αυγά'),
  ('Τόνος σε νερό', 'Κρέας, ψάρι, αυγά'),
  ('Αυγό', 'Κρέας, ψάρι, αυγά'),
  ('Φασολάκια λαδερά', 'Μαγειρευτά'),
  ('Φακές βρασμένες', 'Όσπρια'),
  ('Ρεβίθια βρασμένα', 'Όσπρια'),
  ('Ρύζι βρασμένο', 'Αμυλούχα'),
  ('Ζυμαρικά βρασμένα', 'Αμυλούχα'),
  ('Κινόα βρασμένη', 'Αμυλούχα'),
  ('Πατάτα βραστή', 'Αμυλούχα'),
  ('Γλυκοπατάτα ψητή', 'Αμυλούχα'),
  ('Βρώμη', 'Αμυλούχα'),
  ('Ψωμί ολικής άλεσης', 'Αμυλούχα'),
  ('Φρυγανιά ολικής', 'Αμυλούχα'),
  ('Ρυζογκοφρέτα', 'Αμυλούχα'),
  ('Μπρόκολο βραστό', 'Λαχανικά'),
  ('Σαλάτα εποχής (χωρίς λάδι)', 'Λαχανικά'),
  ('Φέτα', 'Γαλακτοκομικά'),
  ('Γιαούρτι στραγγιστό 2%', 'Γαλακτοκομικά'),
  ('Τυρί cottage', 'Γαλακτοκομικά'),
  ('Γάλα 1,5%', 'Γαλακτοκομικά'),
  ('Ελαιόλαδο', 'Λιπαρά & ξηροί καρποί'),
  ('Καρύδια', 'Λιπαρά & ξηροί καρποί'),
  ('Αμύγδαλα', 'Λιπαρά & ξηροί καρποί'),
  ('Φυστικοβούτυρο', 'Λιπαρά & ξηροί καρποί'),
  ('Μήλο', 'Φρούτα'),
  ('Μπανάνα', 'Φρούτα'),
  ('Πορτοκάλι', 'Φρούτα'),
  ('Αχλάδι', 'Φρούτα'),
  ('Ακτινίδιο', 'Φρούτα'),
  ('Μέλι', 'Σνακ & γλυκά'),
  ('Τοστ (ψωμί, γαλοπούλα, τυρί)', 'Σνακ & γλυκά'),
  ('Πουτίγκα light (κεσεδάκι)', 'Σνακ & γλυκά')
) as v(name, category)
where f.name = v.name and f.category = '';

-- ───────────── Κάνε τη διατροφολόγο admin ─────────────
-- Αφού φτιάξει λογαριασμό από τη σελίδα εγγραφής, τρέξε (με το δικό της email):
--   update public.profiles set role = 'admin' where email = 'to-email-tis@example.com';
