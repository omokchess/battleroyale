-- ============================================================================
-- Pixel Battle Royale × Supabase 스키마
-- Supabase 대시보드 ▸ SQL Editor 에 통째로 붙여넣고 RUN 하세요.
-- (여러 번 실행해도 안전하도록 idempotent 하게 작성)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 테이블
-- ----------------------------------------------------------------------------

-- 사용자 프로필 (auth.users 1:1). 코인/누적킬/착용코스튬 보관.
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  username         text not null,
  coins            integer not null default 100,
  total_kills      integer not null default 0,
  games_played     integer not null default 0,
  equipped_costume text not null default 'default',
  created_at       timestamptz not null default now()
);

-- 코스튬 카탈로그 (구매 가능한 스킨 = 색 조합)
create table if not exists public.costumes (
  id           text primary key,
  name         text not null,
  price        integer not null default 0,
  color        text not null,        -- 캐릭터 본체 색 (CSS color)
  accent_color text not null,        -- 무기/포인트 색
  sort_order   integer not null default 0
);

-- 보유 코스튬 (다대다)
create table if not exists public.user_costumes (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  costume_id  text not null references public.costumes(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (user_id, costume_id)
);

-- ----------------------------------------------------------------------------
-- 2. Row Level Security (읽기만 허용, 모든 쓰기는 아래 RPC 로만)
-- ----------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.costumes      enable row level security;
alter table public.user_costumes enable row level security;

-- profiles: 누구나 읽기(랭킹/본인 코인 조회). 직접 INSERT/UPDATE/DELETE 불가 → 치팅 방지.
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles for select using (true);

-- costumes: 누구나 읽기
drop policy if exists "costumes_read_all" on public.costumes;
create policy "costumes_read_all" on public.costumes for select using (true);

-- user_costumes: 본인 것만 읽기
drop policy if exists "user_costumes_read_self" on public.user_costumes;
create policy "user_costumes_read_self" on public.user_costumes
  for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. 가입 시 프로필 자동 생성 트리거
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'Player'
    ), 12)
  )
  on conflict (id) do nothing;

  -- 기본 코스튬 지급
  insert into public.user_costumes (user_id, costume_id)
  values (new.id, 'default')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. RPC (모두 SECURITY DEFINER — RLS 우회하여 서버에서 신뢰 처리)
-- ----------------------------------------------------------------------------

-- 한 판 결과 기록: 킬당 10코인 적립 + 누적킬/판수 증가.
-- 클라이언트가 킬 수를 보고하므로 판당 최대 100 으로 캡(가벼운 안티치트).
create or replace function public.record_match(p_kills integer)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  k   integer := greatest(0, least(coalesce(p_kills, 0), 100));
  row public.profiles;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다';
  end if;

  update public.profiles
     set coins        = coins + k * 10,
         total_kills  = total_kills + k,
         games_played = games_played + 1
   where id = auth.uid()
  returning * into row;

  return row;
end;
$$;

-- 코스튬 구매: 보유 여부/코인 확인 후 차감 + 지급 (원자적)
create or replace function public.purchase_costume(p_costume text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  c_price integer;
  row     public.profiles;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다';
  end if;

  select price into c_price from public.costumes where id = p_costume;
  if c_price is null then
    raise exception '존재하지 않는 코스튬입니다';
  end if;

  if exists (select 1 from public.user_costumes
             where user_id = auth.uid() and costume_id = p_costume) then
    raise exception '이미 보유한 코스튬입니다';
  end if;

  if (select coins from public.profiles where id = auth.uid()) < c_price then
    raise exception '코인이 부족합니다';
  end if;

  update public.profiles
     set coins = coins - c_price
   where id = auth.uid()
  returning * into row;

  insert into public.user_costumes (user_id, costume_id)
  values (auth.uid(), p_costume);

  return row;
end;
$$;

-- 코스튬 착용: 보유한 것만
create or replace function public.equip_costume(p_costume text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.profiles;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다';
  end if;

  if not exists (select 1 from public.user_costumes
                 where user_id = auth.uid() and costume_id = p_costume) then
    raise exception '보유하지 않은 코스튬입니다';
  end if;

  update public.profiles
     set equipped_costume = p_costume
   where id = auth.uid()
  returning * into row;

  return row;
end;
$$;

-- 닉네임 변경 (1~12자)
create or replace function public.update_username(p_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  nm  text := btrim(coalesce(p_name, ''));
  row public.profiles;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다';
  end if;
  if char_length(nm) < 1 or char_length(nm) > 12 then
    raise exception '닉네임은 1~12자여야 합니다';
  end if;

  update public.profiles
     set username = nm
   where id = auth.uid()
  returning * into row;

  return row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. 코스튬 시드 (가격/색은 자유롭게 조정 가능)
-- ----------------------------------------------------------------------------
insert into public.costumes (id, name, price, color, accent_color, sort_order) values
  ('default', '기본',     0,   'hsl(190, 85%, 52%)', 'hsl(10, 85%, 65%)',  0),
  ('crimson', '크림슨',   100, 'hsl(350, 85%, 55%)', 'hsl(170, 85%, 65%)', 1),
  ('emerald', '에메랄드', 150, 'hsl(150, 80%, 45%)', 'hsl(330, 85%, 65%)', 2),
  ('gold',    '골드',     300, 'hsl(45, 90%, 55%)',  'hsl(225, 85%, 65%)', 3),
  ('violet',  '바이올렛', 300, 'hsl(270, 80%, 60%)', 'hsl(90, 85%, 65%)',  4),
  ('shadow',  '섀도우',   500, 'hsl(220, 15%, 32%)', 'hsl(40, 90%, 60%)',  5)
on conflict (id) do update
  set name = excluded.name,
      price = excluded.price,
      color = excluded.color,
      accent_color = excluded.accent_color,
      sort_order = excluded.sort_order;

-- ----------------------------------------------------------------------------
-- 6. 기존 가입자(트리거 도입 전) 보정 — 한 번 실행해도 무방
-- ----------------------------------------------------------------------------
insert into public.profiles (id, username)
select u.id, left(coalesce(u.raw_user_meta_data->>'full_name',
                           u.raw_user_meta_data->>'name',
                           split_part(u.email, '@', 1), 'Player'), 12)
from auth.users u
on conflict (id) do nothing;

insert into public.user_costumes (user_id, costume_id)
select id, 'default' from public.profiles
on conflict do nothing;
