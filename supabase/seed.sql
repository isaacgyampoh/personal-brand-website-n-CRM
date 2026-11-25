-- Essential reference data. Idempotent. Contains NO personal or brand data.
-- Demonstration content lives in scripts/seed-demo.ts and is flagged is_demo.

insert into role_permissions (role, permission)
select 'owner', p from unnest(array[
  'dashboard:view','website:edit','website:publish','content:edit','content:publish','media:manage',
  'crm:view','crm:edit','crm:import','crm:export','bookings:view','bookings:manage','events:view','events:manage',
  'courses:manage','products:manage','payments:view','payments:refund','payments:record','finance:export',
  'marketing:manage','analytics:view','settings:manage','users:manage','jobs:manage','audit:view','ai:use'
]) p
union all
select 'admin', p from unnest(array[
  'dashboard:view','website:edit','website:publish','content:edit','content:publish','media:manage',
  'crm:view','crm:edit','crm:import','crm:export','bookings:view','bookings:manage','events:view','events:manage',
  'courses:manage','products:manage','payments:view','payments:refund','payments:record','finance:export',
  'marketing:manage','analytics:view','settings:manage','users:manage','jobs:manage','audit:view','ai:use'
]) p
union all
select 'content_manager', p from unnest(array[
  'dashboard:view','website:edit','website:publish','content:edit','content:publish','media:manage',
  'marketing:manage','analytics:view','ai:use','courses:manage','products:manage'
]) p
union all
select 'booking_manager', p from unnest(array[
  'dashboard:view','bookings:view','bookings:manage','events:view','events:manage','crm:view','crm:edit'
]) p
union all
select 'finance_manager', p from unnest(array[
  'dashboard:view','payments:view','payments:refund','payments:record','finance:export','analytics:view','crm:view'
]) p
on conflict do nothing;

insert into pipeline_stages (name, position, kind, color) values
  ('New', 1, 'open', '#64748b'),
  ('Contacted', 2, 'open', '#0ea5e9'),
  ('Interested', 3, 'open', '#8b5cf6'),
  ('Consultation Booked', 4, 'open', '#f59e0b'),
  ('Converted', 5, 'won', '#16a34a'),
  ('Closed', 6, 'lost', '#9ca3af')
on conflict (name) do nothing;

insert into mailing_lists (name, description) values
  ('Newsletter', 'Main newsletter list (double opt-in)')
on conflict (name) do nothing;

-- Global default working hours (Mon–Fri 09:00–17:00 business time).
insert into availability_rules (service_id, weekday, start_time, end_time)
select null, d, '09:00', '17:00' from generate_series(1,5) d
where not exists (select 1 from availability_rules where service_id is null);

-- Core pages. Legal pages are created as drafts that REQUIRE legal review;
-- they are not published automatically.
insert into pages (slug, title, kind, status, requires_legal_review) values
  ('home', 'Home', 'home', 'draft', false),
  ('about', 'About', 'standard', 'draft', false),
  ('speaking', 'Speaking', 'standard', 'draft', false),
  ('privacy-policy', 'Privacy Policy', 'legal', 'draft', true),
  ('terms-of-service', 'Terms of Service', 'legal', 'draft', true),
  ('cancellation-policy', 'Cancellation Policy', 'legal', 'draft', true),
  ('refund-policy', 'Refund Policy', 'legal', 'draft', true)
on conflict (slug) do nothing;
