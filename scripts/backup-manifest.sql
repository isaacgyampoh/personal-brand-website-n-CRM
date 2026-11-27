-- Business-level fingerprint of the database, captured with every backup and
-- compared after a test restore. Never contains personal data or secrets.
select json_build_object(
  'tables', (select json_object_agg(relname, n_live_tup) from (
      select c.relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint as n_live_tup
        from pg_class c join pg_namespace s on s.oid = c.relnamespace
       where s.nspname = 'public' and c.relkind = 'r' and c.relname not in ('rate_limits','schema_migrations') order by 1) t),
  'ledger_net_minor', (select coalesce(sum(amount_minor),0) from financial_ledger),
  'paid_orders', (select count(*) from orders where status in ('paid','partially_refunded','refunded')),
  'paid_orders_total_minor', (select coalesce(sum(total_minor),0) from orders where status in ('paid','partially_refunded','refunded')),
  'invoices', (select count(*) from invoices),
  'confirmed_appointments', (select count(*) from appointments where status = 'confirmed'),
  'confirmed_registrations', (select count(*) from event_registrations where status = 'confirmed'),
  'active_enrolments', (select count(*) from enrolments where status = 'active'),
  'staff_accounts', (select count(*) from users where role <> 'customer'),
  'accounts_with_password', (select count(*) from users where password_hash is not null),
  'mfa_enabled_staff', (select count(*) from users where role <> 'customer' and mfa_enabled_at is not null),
  'integration_credentials', (select count(*) from integration_configs where secrets_encrypted is not null),
  'max_audit_id', (select coalesce(max(id),0) from audit_logs)
);
