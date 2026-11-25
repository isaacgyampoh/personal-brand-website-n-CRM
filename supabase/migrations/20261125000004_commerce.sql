-- Commerce & payments. Money is stored as integer minor units (pesewas for GHS).
-- Invariants enforced here:
--  * order totals are consistent and non-negative
--  * order status transitions follow an allowed state machine
--  * one receipt per order; one fulfilment per order
--  * payment provider references and webhook events are unique (idempotency)
--  * financial ledger is append-only

create table discount_codes (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique check (code ~ '^[A-Za-z0-9_-]{3,40}$'),
  description text not null default '',
  kind text not null check (kind in ('percent','fixed')),
  value bigint not null check (value > 0),
  currency char(3),
  applies_to text not null default 'all' check (applies_to in ('all','appointment','event_ticket','course','product')),
  target_id uuid,
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  per_customer_limit int not null default 1 check (per_customer_limit > 0),
  redemptions_count int not null default 0 check (redemptions_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100),
  check (kind <> 'fixed' or currency is not null),
  check (max_redemptions is null or redemptions_count <= max_redemptions)
);

create sequence order_reference_seq;

create table orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  contact_id uuid not null references contacts(id),
  user_id uuid references users(id) on delete set null,
  email citext not null,
  customer_name text not null default '',
  status text not null default 'pending' check (status in (
    'pending','paid','failed','expired','cancelled','refunded','partially_refunded','needs_attention')),
  currency char(3) not null,
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0),
  discount_code_id uuid references discount_codes(id) on delete set null,
  attribution jsonb not null default '{}'::jsonb,
  attention_reason text,
  expires_at timestamptz,
  paid_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_minor = subtotal_minor - discount_minor),
  check (refunded_minor <= total_minor),
  check (status not in ('paid','refunded','partially_refunded') or paid_at is not null)
);
create index orders_contact_idx on orders (contact_id, created_at desc);
create index orders_user_idx on orders (user_id, created_at desc);
create index orders_status_idx on orders (status, created_at desc);
create index orders_paid_idx on orders (paid_at desc) where paid_at is not null;
create trigger orders_updated before update on orders
  for each row execute function set_updated_at();

create or replace function enforce_order_transition() returns trigger
language plpgsql as $$
declare ok boolean;
begin
  if new.status = old.status then return new; end if;
  ok := case old.status
    when 'pending' then new.status in ('paid','failed','expired','cancelled','needs_attention')
    when 'failed' then new.status in ('paid','expired','cancelled','needs_attention')
    when 'expired' then new.status in ('paid','needs_attention','cancelled')
    when 'cancelled' then new.status in ('needs_attention')
    when 'paid' then new.status in ('refunded','partially_refunded','needs_attention')
    when 'partially_refunded' then new.status in ('refunded','needs_attention')
    when 'needs_attention' then new.status in ('paid','refunded','partially_refunded','cancelled')
    when 'refunded' then false
    else false
  end;
  if not ok then
    raise exception 'INVALID_ORDER_TRANSITION: % -> %', old.status, new.status using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger orders_transition before update of status on orders
  for each row execute function enforce_order_transition();

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_type text not null check (item_type in ('appointment','event_ticket','course','product')),
  item_id uuid not null,
  description text not null,
  quantity int not null default 1 check (quantity between 1 and 50),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  metadata jsonb not null default '{}'::jsonb,
  check (total_minor = unit_price_minor * quantity)
);
create index order_items_order_idx on order_items (order_id);
create index order_items_item_idx on order_items (item_type, item_id);

create table discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references discount_codes(id),
  order_id uuid not null unique references orders(id) on delete cascade,
  contact_id uuid not null references contacts(id),
  created_at timestamptz not null default now()
);
create index discount_redemptions_contact_idx on discount_redemptions (discount_code_id, contact_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  provider text not null check (provider in ('paystack','manual')),
  provider_reference text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null,
  status text not null default 'initialized'
    check (status in ('initialized','success','failed','abandoned','reversed')),
  channel text,
  authorization_url text,
  provider_transaction_id text,
  gateway_response text,
  recorded_by uuid references users(id) on delete set null,
  notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference),
  check (provider <> 'manual' or recorded_by is not null)
);
create index payments_order_idx on payments (order_id);
create index payments_pending_idx on payments (created_at) where status = 'initialized';
create trigger payments_updated before update on payments
  for each row execute function set_updated_at();

-- Raw provider webhook events. event_key is provider-derived and unique so a
-- redelivered webhook is recorded once and processed once.
create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  event_type text not null,
  reference text,
  payload jsonb not null,
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (provider, event_key)
);
create index payment_events_reference_idx on payment_events (reference);

create or replace function guard_payment_event() returns trigger
language plpgsql as $$
begin
  if new.payload is distinct from old.payload or new.event_key is distinct from old.event_key
     or new.signature_valid is distinct from old.signature_valid then
    raise exception 'IMMUTABLE_RECORD: payment event payload cannot change' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger payment_events_guard before update on payment_events
  for each row execute function guard_payment_event();
create trigger payment_events_nodelete before delete on payment_events
  for each row execute function forbid_mutation();

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  payment_id uuid references payments(id),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','processing','processed','failed')),
  provider_refund_id text,
  requested_by uuid references users(id) on delete set null,
  idempotency_key text not null unique,
  failure_reason text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index refunds_order_idx on refunds (order_id);

create sequence receipt_number_seq;

create table invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  order_id uuid not null unique references orders(id),
  kind text not null default 'receipt' check (kind in ('receipt','invoice')),
  snapshot jsonb not null,
  issued_at timestamptz not null default now()
);
create trigger invoices_immutable before update or delete on invoices
  for each row execute function forbid_mutation();

-- Append-only financial ledger used for reconciliation and revenue reporting.
create table financial_ledger (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id),
  payment_id uuid references payments(id),
  refund_id uuid references refunds(id),
  kind text not null check (kind in ('payment','refund','manual_payment','adjustment')),
  amount_minor bigint not null,
  currency char(3) not null,
  memo text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind in ('payment','manual_payment') and amount_minor > 0)
      or (kind = 'refund' and amount_minor < 0)
      or kind = 'adjustment')
);
create unique index financial_ledger_payment_unique on financial_ledger (payment_id) where kind in ('payment','manual_payment');
create unique index financial_ledger_refund_unique on financial_ledger (refund_id) where kind = 'refund';
create index financial_ledger_created_idx on financial_ledger (created_at);
create trigger financial_ledger_immutable before update or delete on financial_ledger
  for each row execute function forbid_mutation();

-- Access rights to paid/free resources. Every protected resource is checked
-- against this table server-side.
create table entitlements (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id),
  user_id uuid references users(id) on delete set null,
  resource_type text not null check (resource_type in ('course','product','event')),
  resource_id uuid not null,
  order_id uuid references orders(id),
  source text not null default 'purchase' check (source in ('purchase','free','complimentary','manual')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text
);
create unique index entitlements_active_unique on entitlements (contact_id, resource_type, resource_id) where revoked_at is null;
create index entitlements_user_idx on entitlements (user_id) where revoked_at is null;
create index entitlements_order_idx on entitlements (order_id);
