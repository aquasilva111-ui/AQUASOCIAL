-- FASE 8: identities, creators, entitlements, creator economy, audit.
-- Money is always an integer amount in the currency's minor unit (BRL 19,90 = 1990).

-- Age assurance result only (never documents). Unverified = no +18 access.
create table adult_accounts (
  did text primary key,
  age_verified_at timestamptz,
  age_verification_ref text,
  age_verification_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table creators (
  id text primary key,
  did text not null unique,
  handle text,
  display_name text,
  status text not null check (status in ('applied', 'approved', 'rejected', 'suspended')),
  subscriptions_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- Configurable fees in basis points (1% = 100). No permanent percentages.
create table fee_config (
  id int primary key default 1 check (id = 1),
  platform_fee_bps int not null default 0 check (platform_fee_bps between 0 and 10000),
  processing_fee_bps int not null default 0 check (processing_fee_bps between 0 and 10000),
  tax_bps int not null default 0 check (tax_bps between 0 and 10000),
  updated_at timestamptz not null default now()
);
insert into fee_config (id) values (1);

create table subscription_tiers (
  id text primary key,
  owner_type text not null check (owner_type in ('creator', 'studio')),
  owner_id text not null,
  name text not null check (length(name) between 1 and 60),
  description text,
  price_minor bigint not null check (price_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  billing_period text not null check (billing_period in ('month', 'year')),
  benefits jsonb not null default '[]',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index subscription_tiers_owner on subscription_tiers (owner_type, owner_id);

-- Server-owned access policy for sellable resources (posts, image sets...).
-- Videos and studio titles (later phases) carry the same columns.
create table adult_resources (
  resource_type text not null,
  resource_id text not null,
  creator_id text references creators (id) on delete restrict,
  access_policy text not null check (access_policy in (
    'free', 'follower_only', 'subscriber_only', 'tier_required',
    'ppv_required', 'purchase_required', 'rental_required', 'custom')),
  required_tier_id text references subscription_tiers (id) on delete restrict,
  status text not null default 'published' check (status in (
    'draft', 'published', 'quarantined', 'removed')),
  created_at timestamptz not null default now(),
  primary key (resource_type, resource_id)
);

-- What can be bought. Orders snapshot the price, so editing an offer never
-- rewrites history.
create table offers (
  id text primary key,
  seller_type text not null check (seller_type in ('creator', 'studio')),
  seller_id text not null,
  kind text not null check (kind in ('ppv', 'purchase', 'rental', 'subscription')),
  resource_type text,
  resource_id text,
  tier_id text references subscription_tiers (id) on delete restrict,
  price_minor bigint not null check (price_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  access_hours int check (access_hours is null or access_hours > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((kind = 'subscription') = (tier_id is not null)),
  check (kind <> 'rental' or access_hours is not null),
  check (kind <> 'ppv' or access_hours is not null)
);

create table orders (
  id text primary key,
  buyer_did text not null,
  seller_type text not null,
  seller_id text not null,
  type text not null check (type in ('ppv', 'purchase', 'rental', 'subscription')),
  offer_id text not null references offers (id) on delete restrict,
  resource_type text,
  resource_id text,
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  fees_minor bigint not null default 0 check (fees_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in (
    'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED',
    'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED', 'CHARGEBACK')),
  payment_provider text not null,
  provider_reference text unique,
  idempotency_key text not null,
  subscription_id text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  unique (buyer_did, idempotency_key)
);
create index orders_buyer on orders (buyer_did);
create index orders_seller on orders (seller_type, seller_id);

-- Provider webhook dedupe: the same event can never be applied twice.
create table payment_events (
  id bigserial primary key,
  provider text not null,
  provider_event_id text not null,
  type text not null,
  order_id text references orders (id) on delete restrict,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table subscriptions (
  id text primary key,
  subscriber_did text not null,
  target_type text not null check (target_type in ('creator', 'studio')),
  target_id text not null,
  tier_id text not null references subscription_tiers (id) on delete restrict,
  status text not null check (status in (
    'PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED',
    'SUSPENDED', 'REFUNDED', 'DISPUTED')),
  started_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  provider_reference text,
  created_at timestamptz not null default now()
);
create index subscriptions_subscriber on subscriptions (subscriber_did);
create index subscriptions_target on subscriptions (target_type, target_id);

-- Grants are never deleted; revocation and expiry keep the record.
create table entitlements (
  id text primary key,
  user_did text not null,
  resource_type text not null,
  resource_id text not null,
  type text not null check (type in (
    'free', 'follower', 'subscription', 'tier', 'purchase', 'ppv', 'rental',
    'creator_granted', 'promotional', 'administrative', 'collection')),
  source_type text,
  source_id text,
  tier_id text,
  granted_at timestamptz not null default now(),
  starts_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text
);
create index entitlements_user_resource on entitlements (user_did, resource_type, resource_id);
create index entitlements_source on entitlements (source_type, source_id);

-- Creator revenue ledger: append-only, one row per movement.
create table ledger_entries (
  id bigserial primary key,
  seller_type text not null,
  seller_id text not null,
  order_id text references orders (id) on delete restrict,
  type text not null check (type in (
    'SALE', 'PLATFORM_FEE', 'PROCESSING_FEE', 'REFUND', 'CHARGEBACK',
    'ADJUSTMENT', 'PAYOUT', 'RESERVE', 'RESERVE_RELEASE')),
  amount_minor bigint not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reference text not null,
  created_at timestamptz not null default now(),
  unique (order_id, type, reference)
);
create index ledger_seller on ledger_entries (seller_type, seller_id);

create table audit_events (
  id bigserial primary key,
  actor_did text,
  action text not null,
  resource_type text,
  resource_id text,
  reason text,
  result text not null,
  created_at timestamptz not null default now()
);

create function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger ledger_entries_append_only before update or delete on ledger_entries
  for each row execute function forbid_mutation();
create trigger audit_events_append_only before update or delete on audit_events
  for each row execute function forbid_mutation();
create trigger payment_events_append_only before update or delete on payment_events
  for each row execute function forbid_mutation();
