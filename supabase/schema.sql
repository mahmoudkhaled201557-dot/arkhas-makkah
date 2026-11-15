-- =====================================================
-- أرخص عروض مكة — قاعدة البيانات (Supabase / Postgres)
-- شغّل الملف ده مرة واحدة من: Supabase → SQL Editor → New query → Run
-- =====================================================

-- العروض (بسعرها أو سعرها في الصورة)
create table if not exists public.offers (
  id          bigserial primary key,
  store       text not null,            -- كود المحل: P, O, L, D, B, A, M, R, W ...
  kind        text not null check (kind in ('priced','image')),
  name_en     text,
  name_ar     text,
  grp         text,                     -- مجموعة الصنف: رز، دجاج، زيت ...
  category    text,                     -- القسم: لحوم، ألبان ...
  sub         int,                      -- رقم القسم الفرعي في ClicFlyer
  old_price   numeric,
  price       numeric,
  img         text,                     -- رابط صورة العرض
  run_id      bigint,
  updated_at  timestamptz default now()
);
create index if not exists offers_store_idx on public.offers(store);
create index if not exists offers_grp_idx on public.offers(grp);

-- مجلات العروض
create table if not exists public.flyers (
  id          bigserial primary key,
  store       text not null,
  slug        text not null,
  title_en    text,
  title_ar    text,
  valid_till  date,
  cover       text,
  run_id      bigint,
  updated_at  timestamptz default now()
);

-- سجل مرات التحديث
create table if not exists public.runs (
  id          bigserial primary key,
  started_at  timestamptz default now(),
  finished_at timestamptz,
  offers      int,
  flyers      int,
  ok          boolean default false,
  note        text
);

-- بيانات المستخدمين
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  is_admin   boolean default false,
  created_at timestamptz default now()
);

-- طلبات المستخدمين (قوائم احتياجاتهم)
create table if not exists public.requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  needs      text not null,
  items      text[],
  created_at timestamptz default now()
);
create index if not exists requests_user_idx on public.requests(user_id, created_at desc);

-- عمل profile تلقائي لأي مستخدم جديد
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name',''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- ===== الصلاحيات (Row Level Security) =====
alter table public.offers   enable row level security;
alter table public.flyers   enable row level security;
alter table public.runs     enable row level security;
alter table public.profiles enable row level security;
alter table public.requests enable row level security;

-- العروض والمجلات: أي حد يقرا، ومحدش يكتب غير السيرفر (service role)
drop policy if exists "offers read" on public.offers;
create policy "offers read" on public.offers for select using (true);
drop policy if exists "flyers read" on public.flyers;
create policy "flyers read" on public.flyers for select using (true);
drop policy if exists "runs read admin" on public.runs;
create policy "runs read admin" on public.runs for select using (public.is_admin());

-- الملف الشخصي: كل واحد يشوف ويعدل بتاعه، والأدمن يشوف الكل
drop policy if exists "profile own read" on public.profiles;
create policy "profile own read" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profile own update" on public.profiles;
create policy "profile own update" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid()));

-- الطلبات: كل واحد يضيف ويشوف بتاعه، والأدمن يشوف الكل
drop policy if exists "requests own insert" on public.requests;
create policy "requests own insert" on public.requests for insert with check (user_id = auth.uid());
drop policy if exists "requests own read" on public.requests;
create policy "requests own read" on public.requests for select using (user_id = auth.uid() or public.is_admin());

-- عرض للأدمن: الأصناف الأكثر طلباً
create or replace view public.top_items with (security_invoker = true) as
  select trim(i) as item, count(*) as times
  from public.requests, unnest(items) as i
  group by trim(i) order by times desc;

-- =====================================================
-- بعد ما تعمل حسابك في الموقع، اعمل نفسك أدمن بالسطر ده (غيّر الإيميل):
-- update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'YOUR_EMAIL@gmail.com');
-- =====================================================
