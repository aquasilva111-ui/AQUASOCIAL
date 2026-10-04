-- F0: durable follow/mute for the +18 context, a +18-only signal log with
-- user privacy switches, and a shared (database-backed) rate limit store.
-- Additive only. Keyed by DID, like adult_blocks, so it never depends on the
-- public social graph.

create table adult_follows (
  follower_did text not null,
  creator_did text not null,
  created_at timestamptz not null default now(),
  primary key (follower_did, creator_did),
  check (follower_did <> creator_did)
);
create index adult_follows_creator on adult_follows (creator_did);

create table adult_mutes (
  muter_did text not null,
  creator_did text not null,
  created_at timestamptz not null default now(),
  primary key (muter_did, creator_did),
  check (muter_did <> creator_did)
);

create table adult_privacy_settings (
  user_did text primary key,
  signals_enabled boolean not null default true,
  search_history_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Signals feed future recommendations. They live only in the +18 context and
-- the user can read and wipe them at any time.
create table adult_signals (
  id bigint generated always as identity primary key,
  user_did text not null,
  kind text not null check (kind in (
    'view', 'like', 'save', 'search', 'hide', 'follow', 'unfollow', 'mute', 'unmute')),
  resource_type text check (resource_type is null or length(resource_type) <= 40),
  resource_id text check (resource_id is null or length(resource_id) <= 200),
  created_at timestamptz not null default now()
);
create index adult_signals_user on adult_signals (user_did, created_at desc);

-- Fixed-window counters shared by every API instance.
create table adult_rate_limits (
  key text not null,
  window_start bigint not null,
  hits int not null,
  primary key (key, window_start)
);
create index adult_rate_limits_window on adult_rate_limits (window_start);
