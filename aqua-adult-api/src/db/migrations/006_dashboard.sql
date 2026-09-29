-- FASE 13: Creator & Studio Dashboard. Additive only: no data is dropped.

-- Creator videos gain scheduled publication and archiving. A scheduled video
-- becomes visible once scheduled_at passes (evaluated at read time, so no
-- background worker is needed for correctness).
alter table videos drop constraint videos_status_check;
alter table videos add constraint videos_status_check check (status in (
  'draft', 'scheduled', 'published', 'archived', 'quarantined', 'removed'));
alter table videos add column scheduled_at timestamptz;
alter table videos add column archived_at timestamptz;
alter table videos add constraint videos_scheduled_has_time
  check (status <> 'scheduled' or scheduled_at is not null);

-- Studios get the same subscriptions switch creators already have.
-- Switching off blocks new checkouts only; existing subscriptions and their
-- history are untouched.
alter table studios add column subscriptions_enabled boolean not null default true;

-- Creators that already sell tiers keep selling after this migration.
update creators set subscriptions_enabled = true
 where id in (select owner_id from subscription_tiers where owner_type = 'creator' and active);

-- ------------------------------------------------------------ payouts
-- Architecture only: no provider is chosen, so no money ever moves.
-- Bank/card details are never stored here — only the provider's opaque
-- account reference once a real provider onboards the seller.
create table payout_accounts (
  id text primary key,
  seller_type text not null check (seller_type in ('creator', 'studio')),
  seller_id text not null,
  provider text,
  provider_account_ref text,
  status text not null default 'PENDING_PROVIDER' check (status in (
    'PENDING_PROVIDER', 'PENDING_VERIFICATION', 'VERIFIED', 'DISABLED')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_type, seller_id)
);

create table payout_requests (
  id text primary key,
  seller_type text not null check (seller_type in ('creator', 'studio')),
  seller_id text not null,
  payout_account_id text not null references payout_accounts (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'REQUESTED' check (status in (
    'REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PAID', 'FAILED')),
  requested_by text not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index payout_requests_seller on payout_requests (seller_type, seller_id);

-- One row per transfer attempt, written only by a real provider integration.
create table payouts (
  id text primary key,
  payout_request_id text not null references payout_requests (id) on delete restrict,
  provider text not null,
  provider_reference text unique,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REVERSED')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
