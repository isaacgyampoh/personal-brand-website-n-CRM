-- Website pop-ups & campaigns (Studio → Website → Pop-ups & campaigns).
-- Additive only. Event pop-ups read live event data (title, flyer, dates, seats,
-- price) at display time — nothing about the event is copied here.

create table site_popups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  kind text not null default 'custom'
    check (kind in ('event','announcement','coaching','course','offer','newsletter','resource','custom')),
  -- One pop-up per event; deleting the event removes its pop-up.
  event_id uuid unique references events(id) on delete cascade,
  layout text not null default 'editorial' check (layout in ('editorial','flyer','minimal','countdown','sheet')),
  -- Empty text = use the event's own details (event pop-ups) or the layout default.
  eyebrow text not null default '' check (length(eyebrow) <= 60),
  heading text not null default '' check (length(heading) <= 140),
  body text not null default '' check (length(body) <= 600),
  button_text text not null default '' check (length(button_text) <= 40),
  -- Same-site path ("/services") or an https:// URL.
  destination text not null default '' check (destination = '' or destination ~ '^(/[^/]|/$|https://)'),
  image_media_id uuid references media_assets(id) on delete set null,
  -- Validated hex colours; empty = brand colours from Business profile.
  colors jsonb not null default '{}'::jsonb,
  pages text not null default 'all' check (pages in ('all','home','selected')),
  page_paths text[] not null default '{}',
  devices text not null default 'all' check (devices in ('all','mobile','desktop')),
  delay_seconds int not null default 5 check (delay_seconds between 0 and 120),
  frequency text not null default 'dismiss_period' check (frequency in ('session','dismiss_period','every_page')),
  dismiss_days int not null default 7 check (dismiss_days between 0 and 365),
  priority int not null default 0 check (priority between -100 and 100),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','active','paused')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (kind <> 'event' or event_id is not null)
);
create index site_popups_live_idx on site_popups (priority desc) where status = 'active';
create trigger site_popups_updated before update on site_popups
  for each row execute function set_updated_at();
alter table site_popups enable row level security;
revoke all on site_popups from public;

-- Impressions, clicks and dismissals. Cookieless: visitor_hash is the same
-- daily-rotating salted hash used by page analytics (no IP stored).
create table popup_events (
  id bigint generated always as identity primary key,
  popup_id uuid not null references site_popups(id) on delete cascade,
  name text not null check (name in ('impression','click','dismiss')),
  visitor_hash text,
  device text check (device in ('mobile','tablet','desktop')),
  path text check (length(path) <= 500),
  occurred_at timestamptz not null default now()
);
create index popup_events_popup_idx on popup_events (popup_id, name, occurred_at);
alter table popup_events enable row level security;
revoke all on popup_events from public;

-- Conversions are attributed through the existing first-party attribution
-- cookie ({"popupId": …} on the registration / order / subscriber record).
create index event_registrations_popup_idx on event_registrations ((attribution->>'popupId')) where attribution ? 'popupId';
create index orders_popup_idx on orders ((attribution->>'popupId')) where attribution ? 'popupId';
