-- CRM: contacts (leads + customers), pipeline, activities, tasks, segments,
-- form submissions, partnership/speaking opportunities.

create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position int not null,
  kind text not null default 'open' check (kind in ('open','won','lost')),
  color text not null default '#6b7280' check (color ~ '^#[0-9a-fA-F]{6}$')
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references users(id) on delete set null,
  email citext,
  full_name text not null default '' check (length(full_name) <= 200),
  phone text check (phone is null or length(phone) <= 32),
  company text not null default '',
  job_title text not null default '',
  lifecycle text not null default 'lead' check (lifecycle in ('lead','customer','partner')),
  stage_id uuid references pipeline_stages(id) on delete set null,
  source text not null default 'website',
  attribution jsonb not null default '{}'::jsonb,
  consent_marketing boolean not null default false,
  consent_at timestamptz,
  consent_source text,
  total_spent_minor bigint not null default 0 check (total_spent_minor >= 0),
  last_activity_at timestamptz,
  next_follow_up_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (email is not null or phone is not null)
);
create unique index contacts_email_unique on contacts (email) where email is not null and deleted_at is null;
create index contacts_phone_idx on contacts (phone) where phone is not null;
create index contacts_stage_idx on contacts (stage_id) where deleted_at is null;
create index contacts_followup_idx on contacts (next_follow_up_at) where next_follow_up_at is not null and deleted_at is null;
create index contacts_search_idx on contacts using gin (
  to_tsvector('simple', coalesce(full_name,'') || ' ' || coalesce(email::text,'') || ' ' || coalesce(company,''))
);
create trigger contacts_updated before update on contacts
  for each row execute function set_updated_at();

create table crm_tags (
  id uuid primary key default gen_random_uuid(),
  name citext not null unique,
  color text not null default '#6b7280' check (color ~ '^#[0-9a-fA-F]{6}$')
);

create table contact_tags (
  contact_id uuid not null references contacts(id) on delete cascade,
  tag_id uuid not null references crm_tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);
create index contact_tags_tag_idx on contact_tags (tag_id);

create table crm_activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  kind text not null check (kind in (
    'note','email','call','meeting','form','booking','payment','registration',
    'enrolment','purchase','stage_change','consent','system','refund','assessment')),
  title text not null,
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  actor_id uuid references users(id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index crm_activities_contact_idx on crm_activities (contact_id, occurred_at desc);
create index crm_activities_recent_idx on crm_activities (occurred_at desc);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 300),
  notes text not null default '',
  contact_id uuid references contacts(id) on delete cascade,
  related_type text,
  related_id text,
  due_at timestamptz,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','done','cancelled')),
  assigned_to uuid references users(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index tasks_open_idx on tasks (due_at nulls last) where status = 'open';

create table segments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  filter jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger segments_updated before update on segments
  for each row execute function set_updated_at();

create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  form text not null check (form in ('contact','speaking','partnership','newsletter','lead_magnet','testimonial','corporate_training','media')),
  contact_id uuid references contacts(id) on delete set null,
  payload jsonb not null,
  consent_marketing boolean not null default false,
  status text not null default 'new' check (status in ('new','reviewed','archived','spam')),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index form_submissions_created_idx on form_submissions (created_at desc);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('speaking','corporate_training','sponsorship','brand_partnership','collaboration','media','event_invitation')),
  title text not null,
  organisation text not null default '',
  contact_id uuid references contacts(id) on delete set null,
  stage text not null default 'enquiry'
    check (stage in ('enquiry','qualifying','proposal','negotiation','confirmed','completed','declined')),
  fee_minor bigint check (fee_minor is null or fee_minor >= 0),
  currency char(3) not null default 'GHS',
  event_date date,
  location text not null default '',
  notes text not null default '',
  next_follow_up_at timestamptz,
  source_submission_id uuid references form_submissions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger opportunities_updated before update on opportunities
  for each row execute function set_updated_at();
create index opportunities_stage_idx on opportunities (stage);
