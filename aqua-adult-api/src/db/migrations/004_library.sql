-- FASE 11: My +18 Library. Relations only — media is never copied.
-- Purchased/PPV/Rentals/Collections come from entitlements, Subscriptions
-- from subscriptions, Continue Watching/History from the Phase 9 tables.

-- Saved does not mean purchased: items stay subject to the current policy.
create table library_saved (
  user_did text not null,
  resource_type text not null,
  resource_id text not null,
  saved_at timestamptz not null default now(),
  primary key (user_did, resource_type, resource_id)
);

-- Its own relation, deliberately separate from Saved.
create table library_watch_later (
  user_did text not null,
  resource_type text not null,
  resource_id text not null,
  added_at timestamptz not null default now(),
  primary key (user_did, resource_type, resource_id)
);
