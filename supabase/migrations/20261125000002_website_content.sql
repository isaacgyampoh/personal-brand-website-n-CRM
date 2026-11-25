-- Website pages (visual builder), blog/content studio, public proof content.

create table pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*$' or slug = 'home'),
  title text not null check (length(title) between 1 and 200),
  kind text not null default 'standard' check (kind in ('home','standard','landing','legal','system')),
  status text not null default 'draft' check (status in ('draft','published','scheduled','archived')),
  draft_content jsonb not null default '{"content": [], "root": {"props": {}}}'::jsonb,
  published_content jsonb,
  seo jsonb not null default '{}'::jsonb,
  requires_legal_review boolean not null default false,
  scheduled_publish_at timestamptz,
  published_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null,
  check (status <> 'scheduled' or scheduled_publish_at is not null),
  check (status <> 'published' or published_content is not null)
);
create trigger pages_updated before update on pages
  for each row execute function set_updated_at();
create index pages_scheduled_idx on pages (scheduled_publish_at) where status = 'scheduled';

create table page_revisions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  content jsonb not null,
  seo jsonb not null default '{}'::jsonb,
  kind text not null default 'publish' check (kind in ('publish','draft_snapshot','restore')),
  note text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index page_revisions_page_idx on page_revisions (page_id, created_at desc);

create table redirects (
  id uuid primary key default gen_random_uuid(),
  from_path text not null unique check (from_path ~ '^/[^\s]*$'),
  to_path text not null check (to_path ~ '^(/|https://)[^\s]*$'),
  status_code int not null default 301 check (status_code in (301,302,307,308)),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Content studio
-- ---------------------------------------------------------------------------
create table content_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default ''
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 250),
  excerpt text not null default '' check (length(excerpt) <= 600),
  body jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  body_text text not null default '',
  cover_media_id uuid references media_assets(id) on delete set null,
  video_url text check (video_url is null or video_url ~ '^https://'),
  category_id uuid references content_categories(id) on delete set null,
  author_name text not null default '',
  featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
  scheduled_at timestamptz,
  published_at timestamptz,
  seo jsonb not null default '{}'::jsonb,
  reading_minutes int not null default 1,
  is_demo boolean not null default false,
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(excerpt,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(body_text,'')), 'C')
  ) stored,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'scheduled' or scheduled_at is not null),
  check (status <> 'published' or published_at is not null)
);
create trigger articles_updated before update on articles
  for each row execute function set_updated_at();
create index articles_published_idx on articles (published_at desc) where status = 'published';
create index articles_scheduled_idx on articles (scheduled_at) where status = 'scheduled';
create index articles_search_idx on articles using gin (search);

create table article_tags (
  article_id uuid not null references articles(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (article_id, tag_id)
);
create index article_tags_tag_idx on article_tags (tag_id);

create table article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  title text not null,
  body jsonb not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index article_revisions_article_idx on article_revisions (article_id, created_at desc);

create table content_calendar_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 250),
  channel text not null check (channel in ('linkedin','article','newsletter','campaign','instagram','video','other')),
  status text not null default 'idea' check (status in ('idea','drafting','ready','published','skipped')),
  planned_for timestamptz not null,
  body text not null default '' check (length(body) <= 10000),
  article_id uuid references articles(id) on delete set null,
  reminder_at timestamptz,
  reminder_sent_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger content_calendar_updated before update on content_calendar_items
  for each row execute function set_updated_at();
create index content_calendar_planned_idx on content_calendar_items (planned_for);

-- ---------------------------------------------------------------------------
-- Proof content. Testimonials and case studies cannot be published without
-- recorded consent (enforced by CHECK constraints).
-- ---------------------------------------------------------------------------
create table testimonials (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (length(author_name) between 1 and 120),
  author_title text not null default '',
  company text not null default '',
  quote text not null check (length(quote) between 10 and 2000),
  rating int check (rating between 1 and 5),
  photo_media_id uuid references media_assets(id) on delete set null,
  source text not null default 'submitted' check (source in ('submitted','manual','imported')),
  consent_confirmed boolean not null default false,
  consent_note text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  featured boolean not null default false,
  submitted_by_email citext,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  check (status <> 'approved' or consent_confirmed)
);
create index testimonials_public_idx on testimonials (featured desc, approved_at desc) where status = 'approved';

create table case_studies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  client_name text not null default '',
  summary text not null default '',
  challenge jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  approach jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  outcome jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  cover_media_id uuid references media_assets(id) on delete set null,
  consent_confirmed boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or consent_confirmed)
);
create trigger case_studies_updated before update on case_studies
  for each row execute function set_updated_at();

create table media_appearances (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('interview','podcast','video','press','speaking_engagement')),
  title text not null,
  outlet text not null default '',
  url text check (url is null or url ~ '^https://'),
  appeared_on date,
  description text not null default '',
  image_media_id uuid references media_assets(id) on delete set null,
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create index media_appearances_public_idx on media_appearances (appeared_on desc) where published;

create table speaking_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  audience text not null default '',
  formats text[] not null default '{}',
  position int not null default 0,
  active boolean not null default true
);
