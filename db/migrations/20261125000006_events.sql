-- Masterclasses & events. Seat inventory is protected by a trigger that locks
-- the event (and ticket type) row and counts active seats, so concurrent
-- registrations can never oversell. Each registration row is one seat.

create table events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  subtitle text not null default '',
  kind text not null default 'masterclass'
    check (kind in ('masterclass','webinar','workshop','group_coaching','programme','conference','other')),
  format text not null default 'online' check (format in ('online','in_person','hybrid')),
  summary text not null default '' check (length(summary) <= 600),
  description jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  cover_media_id uuid references media_assets(id) on delete set null,
  flyer_media_id uuid references media_assets(id) on delete set null,
  venue_name text not null default '',
  venue_address text not null default '',
  timezone text not null default 'Africa/Accra',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int check (capacity is null or capacity > 0),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  waitlist_enabled boolean not null default true,
  speakers jsonb not null default '[]'::jsonb,
  agenda jsonb not null default '[]'::jsonb,
  faqs jsonb not null default '[]'::jsonb,
  certificate_enabled boolean not null default false,
  feedback_enabled boolean not null default true,
  status text not null default 'draft' check (status in ('draft','published','cancelled','completed')),
  cancellation_reason text,
  seo jsonb not null default '{}'::jsonb,
  duplicated_from uuid references events(id) on delete set null,
  is_demo boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (registration_closes_at is null or registration_opens_at is null or registration_closes_at > registration_opens_at)
);
create index events_public_idx on events (starts_at) where status in ('published','completed');
create trigger events_updated before update on events
  for each row execute function set_updated_at();

-- Private joining information, separated from public event data so it can
-- never be serialised onto a public page by accident.
create table event_access (
  event_id uuid primary key references events(id) on delete cascade,
  meeting_provider text not null default 'manual' check (meeting_provider in ('manual','zoom','google_meet')),
  meeting_url text check (meeting_url is null or meeting_url ~ '^https://'),
  meeting_id text,
  passcode text,
  instructions text not null default '',
  access_opens_minutes_before int not null default 30 check (access_opens_minutes_before between 0 and 1440),
  updated_at timestamptz not null default now()
);

create table event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  position int not null default 0,
  check (ends_at > starts_at)
);
create index event_sessions_event_idx on event_sessions (event_id, starts_at);

create table ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  description text not null default '',
  price_minor bigint not null default 0 check (price_minor >= 0),
  currency char(3) not null default 'GHS',
  capacity int check (capacity is null or capacity > 0),
  sales_start_at timestamptz,
  sales_end_at timestamptz,
  max_per_order int not null default 10 check (max_per_order between 1 and 50),
  visibility text not null default 'public' check (visibility in ('public','hidden','complimentary')),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index ticket_types_event_idx on ticket_types (event_id, position);

create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  event_id uuid not null references events(id),
  ticket_type_id uuid not null references ticket_types(id),
  contact_id uuid not null references contacts(id),
  user_id uuid references users(id) on delete set null,
  order_id uuid references orders(id),
  attendee_name text not null default '',
  attendee_email citext not null,
  status text not null check (status in ('reserved','confirmed','cancelled','refunded','expired')),
  source text not null default 'online' check (source in ('online','manual','complimentary','waitlist')),
  hold_expires_at timestamptz,
  attended_at timestamptz,
  checked_in_by uuid references users(id) on delete set null,
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at timestamptz,
  feedback_requested_at timestamptz,
  attribution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'reserved' or hold_expires_at is not null)
);
create index event_registrations_event_idx on event_registrations (event_id, status);
create index event_registrations_contact_idx on event_registrations (contact_id);
create index event_registrations_user_idx on event_registrations (user_id);
create index event_registrations_order_idx on event_registrations (order_id);
create unique index event_registrations_one_per_email on event_registrations (event_id, attendee_email)
  where status in ('reserved','confirmed') and order_id is null;
create trigger event_registrations_updated before update on event_registrations
  for each row execute function set_updated_at();

create or replace function enforce_event_capacity() returns trigger
language plpgsql as $$
declare
  ev_cap int; tt_cap int; used int; tused int;
begin
  if new.status not in ('reserved','confirmed') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('reserved','confirmed') and new.status = old.status
     and new.ticket_type_id = old.ticket_type_id then
    return new;
  end if;
  select capacity into ev_cap from events where id = new.event_id for update;
  select capacity into tt_cap from ticket_types where id = new.ticket_type_id for update;
  if ev_cap is not null then
    select count(*) into used from event_registrations
     where event_id = new.event_id and id <> new.id
       and (status = 'confirmed' or (status = 'reserved' and hold_expires_at > now()));
    if used + 1 > ev_cap then
      raise exception 'EVENT_SOLD_OUT' using errcode = 'P0001';
    end if;
  end if;
  if tt_cap is not null then
    select count(*) into tused from event_registrations
     where ticket_type_id = new.ticket_type_id and id <> new.id
       and (status = 'confirmed' or (status = 'reserved' and hold_expires_at > now()));
    if tused + 1 > tt_cap then
      raise exception 'TICKET_SOLD_OUT' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger event_registrations_capacity before insert or update of status, ticket_type_id on event_registrations
  for each row execute function enforce_event_capacity();

create table session_attendance (
  registration_id uuid not null references event_registrations(id) on delete cascade,
  session_id uuid not null references event_sessions(id) on delete cascade,
  attended_at timestamptz not null default now(),
  primary key (registration_id, session_id)
);

create table event_waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  contact_id uuid not null references contacts(id),
  email citext not null,
  full_name text not null default '',
  status text not null default 'waiting' check (status in ('waiting','notified','converted','removed')),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);

create table event_resources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  kind text not null check (kind in ('recording','slides','download','link')),
  title text not null,
  media_id uuid references media_assets(id) on delete restrict,
  url text check (url is null or url ~ '^https://'),
  available_from timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now(),
  check (media_id is not null or url is not null)
);
create index event_resources_event_idx on event_resources (event_id, position);

create table event_feedback (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references event_registrations(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comments text not null default '' check (length(comments) <= 4000),
  may_quote boolean not null default false,
  created_at timestamptz not null default now()
);
