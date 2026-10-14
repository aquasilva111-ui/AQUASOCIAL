-- Additive extension of the existing Shops database, never a second identity store.
create schema if not exists aqua;
create table if not exists aqua.ecosystem_resources (
  id uuid primary key,
  kind text not null check (kind in ('community','portal','app','broadcast','workspace','verification')),
  owner_did text not null,
  slug text not null,
  revision integer not null default 1,
  document jsonb not null,
  unique(kind, owner_did, slug)
);
create index if not exists ecosystem_resources_kind on aqua.ecosystem_resources(kind);
create table if not exists aqua.ecosystem_audit (
  id uuid primary key,
  actor_did text not null,
  resource_id uuid not null,
  action text not null,
  timestamp timestamptz not null default now()
);
create table if not exists aqua.ecosystem_consent (
  did text primary key,
  analytics boolean not null default false
);
create table if not exists aqua.ecosystem_events (
  id uuid primary key,
  owner_did text not null,
  resource_id uuid not null references aqua.ecosystem_resources(id),
  event text not null,
  context jsonb not null,
  timestamp timestamptz not null default now()
);
create index if not exists ecosystem_events_owner on aqua.ecosystem_events(owner_did, timestamp);
create table if not exists aqua.ecosystem_ledger (
  id uuid primary key,
  owner_did text not null,
  source_type text not null,
  source_id text not null,
  gross bigint not null check (gross >= 0),
  fees bigint not null check (fees >= 0 and fees <= gross),
  net bigint not null check (net = gross - fees),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('pending','available','paid','refunded')),
  created_at timestamptz not null default now(),
  unique(source_type, source_id)
);
create table if not exists aqua.ecosystem_migrations (id text primary key, applied_at timestamptz not null default now());
insert into aqua.ecosystem_migrations(id) values ('001_ecosystem') on conflict do nothing;
