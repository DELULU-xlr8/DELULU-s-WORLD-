-- College Quiz Competition: run this whole file in Supabase SQL Editor.
-- Database week boundaries use Asia/Kolkata (IST). Keep the service_role key private.

create extension if not exists pgcrypto;

create or replace function public.ist_week_start(p_ts timestamptz default now())
returns date language sql stable as $$
  select date_trunc('week', p_ts at time zone 'Asia/Kolkata')::date;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Student',
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options)=4),
  correct_option integer not null check (correct_option between 0 and 3),
  points integer not null default 1 check (points between 1 and 100),
  week_start date not null,
  is_published boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_option integer not null check (selected_option between 0 and 3),
  is_correct boolean not null,
  points_earned integer not null default 0,
  submitted_at timestamptz not null default now(),
  unique(user_id, week_start, question_id)
);

create table if not exists public.weekly_winners (
  week_start date primary key,
  winner_user_id uuid references public.profiles(id) on delete set null,
  winner_name text not null,
  winner_points integer not null,
  archived_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.weekly_winners enable row level security;

-- Create a profile automatically after signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1), 'Student'));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

-- Students can read published questions, but the answer key is hidden by column permissions/RPC design.
-- The browser uses this view rather than querying the questions table directly.
create or replace view public.public_questions
with (security_invoker = false) as
select id, question_text, options, points, week_start, created_at
from public.questions where is_published = true;

grant select on public.public_questions to authenticated;

create policy "profiles read authenticated" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid() and role='student');
create policy "admins read questions including answer key" on public.questions for select to authenticated using (public.is_admin());
create policy "admins insert questions" on public.questions for insert to authenticated with check (public.is_admin() and created_by=auth.uid());
create policy "admins update questions" on public.questions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete questions" on public.questions for delete to authenticated using (public.is_admin());
create policy "users read own attempts" on public.attempts for select to authenticated using (user_id=auth.uid() or public.is_admin());
create policy "weekly winners public to authenticated users" on public.weekly_winners for select to authenticated using (true);

-- Submit is atomic and server-graded. Students cannot choose their own points or correct answer.
create or replace function public.submit_quiz(p_week_start date, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid();
  v_question record;
  v_item jsonb;
  v_selected integer;
  v_added integer := 0;
  v_total integer := 0;
  v_count integer := 0;
begin
  if v_user is null then raise exception 'Please log in first'; end if;
  if p_week_start <> public.ist_week_start(now()) then raise exception 'This quiz week is closed'; end if;
  if jsonb_typeof(p_answers) <> 'array' then raise exception 'Invalid answers'; end if;

  for v_item in select value from jsonb_array_elements(p_answers)
  loop
    if not (v_item ? 'question_id') or not (v_item ? 'selected_option') then raise exception 'Invalid answer item'; end if;
    v_selected := (v_item->>'selected_option')::integer;
    if v_selected < 0 or v_selected > 3 then raise exception 'Invalid option'; end if;
    select id, correct_option, points into v_question
      from public.questions
      where id=(v_item->>'question_id')::uuid and week_start=p_week_start and is_published=true;
    if not found then raise exception 'Question is not available'; end if;

    insert into public.attempts(user_id,week_start,question_id,selected_option,is_correct,points_earned)
    values(v_user,p_week_start,v_question.id,v_selected,v_selected=v_question.correct_option,
      case when v_selected=v_question.correct_option then v_question.points else 0 end)
    on conflict(user_id,week_start,question_id) do nothing;
    if found then
      v_count := v_count + 1;
      if v_selected=v_question.correct_option then v_added := v_added + v_question.points; end if;
    end if;
  end loop;

  select coalesce(sum(points_earned),0) into v_total from public.attempts
  where user_id=v_user and week_start=p_week_start;
  return jsonb_build_object('points_earned',v_added,'total_points',v_total,'new_answers_recorded',v_count);
end;
$$;
grant execute on function public.submit_quiz(date,jsonb) to authenticated;

create or replace function public.weekly_leaderboard(p_week_start date default public.ist_week_start(now()))
returns table(display_name text,total_points bigint,attempts bigint)
language sql stable security definer set search_path=public as $$
  select p.display_name, coalesce(sum(a.points_earned),0)::bigint,
         count(a.id)::bigint
  from public.profiles p
  join public.attempts a on a.user_id=p.id and a.week_start=p_week_start
  group by p.id,p.display_name
  order by sum(a.points_earned) desc, count(a.id) desc, min(a.submitted_at) asc
  limit 100;
$$;
grant execute on function public.weekly_leaderboard(date) to authenticated;

-- Weekly archive: schedule this function for Monday 00:05 IST using Supabase Cron.
-- It archives the previous Monday-Sunday week; repeated calls are safe.
create or replace function public.archive_previous_week()
returns void language plpgsql security definer set search_path=public as $$
declare v_prev date := public.ist_week_start(now()) - 7;
begin
  insert into public.weekly_winners(week_start,winner_user_id,winner_name,winner_points)
  select v_prev, p.id, p.display_name, sum(a.points_earned)::integer
  from public.profiles p join public.attempts a on a.user_id=p.id and a.week_start=v_prev
  group by p.id,p.display_name
  order by sum(a.points_earned) desc, count(a.id) desc, min(a.submitted_at) asc
  limit 1
  on conflict(week_start) do nothing;
end;
$$;

-- IMPORTANT: promote your own account to admin after signing up:
-- update public.profiles set role='admin' where id=(select id from auth.users where email='YOUR_EMAIL_HERE');
-- Run the command above separately, replacing YOUR_EMAIL_HERE with your own login email.
-- Do not expose your service_role key or make public write policies.
