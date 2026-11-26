-- Marketing (subscribers, campaigns, tracked links), assessments, analytics.

create table subscribers (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  contact_id uuid references contacts(id) on delete set null,
  full_name text not null default '',
  status text not null default 'pending'
    check (status in ('pending','subscribed','unsubscribed','bounced','complained')),
  source text not null default 'website',
  consent_text text not null,
  confirm_token_hash text unique,
  unsubscribe_token text not null unique,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);
create index subscribers_status_idx on subscribers (status);

create table mailing_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table subscriber_lists (
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  list_id uuid not null references mailing_lists(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (subscriber_id, list_id)
);

create table email_suppressions (
  email citext primary key,
  reason text not null check (reason in ('unsubscribed','bounced','complained','manual')),
  created_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null check (length(subject) between 1 and 200),
  preheader text not null default '',
  body text not null default '' check (length(body) <= 100000),
  audience jsonb not null default '{"type":"all_subscribers"}'::jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  sent_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'scheduled' or scheduled_at is not null)
);
create trigger campaigns_updated before update on campaigns
  for each row execute function set_updated_at();

create table campaign_recipients (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','accepted','failed','suppressed')),
  notification_id uuid references notifications(id) on delete set null,
  sent_at timestamptz,
  primary key (campaign_id, subscriber_id)
);

-- Branded/tracked short links (/go/<slug>) used for campaign attribution and
-- referral links.
create table campaign_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  destination text not null check (destination ~ '^(/|https://)'),
  channel text not null default 'linkedin'
    check (channel in ('linkedin','instagram','x','facebook','tiktok','youtube','email','whatsapp_share','referral','other')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer_contact_id uuid references contacts(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table link_clicks (
  id bigint generated always as identity primary key,
  link_id uuid not null references campaign_links(id) on delete cascade,
  visitor_hash text,
  referrer_host text,
  clicked_at timestamptz not null default now()
);
create index link_clicks_link_idx on link_clicks (link_id, clicked_at);

-- ---------------------------------------------------------------------------
-- Personal brand assessment (deterministic scoring)
-- ---------------------------------------------------------------------------
create table assessments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  intro text not null default '',
  definition jsonb not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger assessments_updated before update on assessments
  for each row execute function set_updated_at();

create table assessment_responses (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  answers jsonb not null,
  scores jsonb not null,
  overall_percent int not null check (overall_percent between 0 and 100),
  result_token text not null unique,
  consent_contact boolean not null default false,
  created_at timestamptz not null default now()
);
create index assessment_responses_assessment_idx on assessment_responses (assessment_id, created_at desc);

-- ---------------------------------------------------------------------------
-- First-party analytics. No raw IPs; visitor_hash rotates daily (salted).
-- ---------------------------------------------------------------------------
create table analytics_events (
  id bigint generated always as identity primary key,
  name text not null check (name ~ '^[a-z_]{2,48}$'),
  path text not null check (length(path) <= 500),
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  link_id uuid,
  visitor_hash text,
  device text check (device in ('mobile','tablet','desktop','bot')),
  props jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index analytics_events_time_idx on analytics_events (occurred_at);
create index analytics_events_name_time_idx on analytics_events (name, occurred_at);

create table ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references users(id) on delete set null,
  task text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_created_idx on ai_usage (created_at);
