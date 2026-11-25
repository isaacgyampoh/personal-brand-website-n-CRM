-- Academy (LMS), certificates and digital products.

create table courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  subtitle text not null default '',
  summary text not null default '' check (length(summary) <= 600),
  description jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  cover_media_id uuid references media_assets(id) on delete set null,
  category text not null default 'general',
  level text not null default 'all' check (level in ('beginner','intermediate','advanced','all')),
  price_minor bigint not null default 0 check (price_minor >= 0),
  currency char(3) not null default 'GHS',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  visibility text not null default 'public' check (visibility in ('public','unlisted','private')),
  certificate_enabled boolean not null default true,
  completion_percent int not null default 100 check (completion_percent between 1 and 100),
  require_quizzes_passed boolean not null default true,
  outcomes text[] not null default '{}',
  seo jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger courses_updated before update on courses
  for each row execute function set_updated_at();

create table course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  position int not null default 0,
  release_after_days int check (release_after_days is null or release_after_days >= 0),
  release_at timestamptz
);
create index course_modules_course_idx on course_modules (course_id, position);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  module_id uuid not null references course_modules(id) on delete cascade,
  title text not null,
  kind text not null default 'text' check (kind in ('video','text','audio','download','quiz','assignment')),
  body jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  video_provider text check (video_provider in ('r2','youtube_unlisted','vimeo','bunny','mux')),
  video_ref text,
  media_id uuid references media_assets(id) on delete restrict,
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  is_preview boolean not null default false,
  position int not null default 0,
  release_after_days int check (release_after_days is null or release_after_days >= 0),
  release_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lessons_module_idx on lessons (module_id, position);
create index lessons_course_idx on lessons (course_id);
create trigger lessons_updated before update on lessons
  for each row execute function set_updated_at();

create table lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  media_id uuid not null references media_assets(id) on delete restrict,
  title text not null,
  position int not null default 0
);

create table enrolments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  contact_id uuid not null references contacts(id),
  user_id uuid references users(id) on delete set null,
  order_id uuid references orders(id),
  status text not null default 'active' check (status in ('active','completed','revoked')),
  last_lesson_id uuid references lessons(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (course_id, contact_id)
);
create index enrolments_user_idx on enrolments (user_id);

create table lesson_progress (
  enrolment_id uuid not null references enrolments(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  completed_at timestamptz,
  position_seconds int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (enrolment_id, lesson_id)
);

-- Questions (including correct answers) are never sent to the browser; the
-- server strips them and grades attempts.
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references lessons(id) on delete cascade,
  pass_percent int not null default 70 check (pass_percent between 1 and 100),
  max_attempts int check (max_attempts is null or max_attempts > 0),
  questions jsonb not null default '[]'::jsonb
);

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  enrolment_id uuid not null references enrolments(id) on delete cascade,
  answers jsonb not null,
  score_percent int not null check (score_percent between 0 and 100),
  passed boolean not null,
  created_at timestamptz not null default now()
);
create index quiz_attempts_enrolment_idx on quiz_attempts (enrolment_id, quiz_id);

create table assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  enrolment_id uuid not null references enrolments(id) on delete cascade,
  body text not null check (length(body) <= 20000),
  status text not null default 'submitted' check (status in ('submitted','reviewed','needs_revision')),
  feedback text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (lesson_id, enrolment_id)
);

create table certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{10,40}$'),
  contact_id uuid not null references contacts(id),
  user_id uuid references users(id) on delete set null,
  course_id uuid references courses(id),
  event_id uuid references events(id),
  recipient_name text not null,
  title text not null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((course_id is not null) <> (event_id is not null))
);
create unique index certificates_course_unique on certificates (course_id, contact_id) where course_id is not null;
create unique index certificates_event_unique on certificates (event_id, contact_id) where event_id is not null;

-- ---------------------------------------------------------------------------
-- Digital products
-- ---------------------------------------------------------------------------
create table products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 200),
  kind text not null default 'ebook' check (kind in ('ebook','guide','template','workbook','presentation','recording','bundle','other')),
  summary text not null default '' check (length(summary) <= 600),
  description jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  cover_media_id uuid references media_assets(id) on delete set null,
  file_media_id uuid references media_assets(id) on delete restrict,
  price_minor bigint not null default 0 check (price_minor >= 0),
  currency char(3) not null default 'GHS',
  is_lead_magnet boolean not null default false,
  download_limit int check (download_limit is null or download_limit > 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  seo jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or file_media_id is not null),
  check (not is_lead_magnet or price_minor = 0)
);
create trigger products_updated before update on products
  for each row execute function set_updated_at();

create table downloads (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references entitlements(id),
  media_id uuid not null references media_assets(id),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index downloads_entitlement_idx on downloads (entitlement_id);
