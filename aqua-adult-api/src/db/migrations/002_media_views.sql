-- FASE 9: AQUA Media Engine + AQUA Views +18.
-- Storage keys are private: never returned to clients, never public URLs.

create table media_assets (
  id text primary key,
  owner_did text not null,
  kind text not null check (kind in ('video', 'image', 'audio', 'captions')),
  purpose text not null default 'original' check (purpose in (
    'original', 'preview', 'poster', 'thumbnail', 'captions')),
  status text not null check (status in (
    'UPLOADING', 'UPLOADED', 'QUEUED', 'PROCESSING', 'READY',
    'FAILED', 'QUARANTINED', 'REMOVED')),
  storage_key text not null,
  mime_type text not null,
  declared_size_bytes bigint not null check (declared_size_bytes > 0),
  size_bytes bigint,
  sha256 text,
  duration_ms int,
  width int,
  height int,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index media_assets_owner on media_assets (owner_did);
create index media_assets_status on media_assets (status);

-- Derived outputs (HLS renditions, poster, thumbnails). The original stays.
create table media_variants (
  id text primary key,
  asset_id text not null references media_assets (id) on delete restrict,
  kind text not null check (kind in ('original', 'hls', 'poster', 'thumbnail', 'low', 'captions')),
  storage_prefix text not null,
  entry_file text not null,
  mime_type text not null,
  width int,
  height int,
  created_at timestamptz not null default now(),
  unique (asset_id, kind)
);

-- Temporary upload authorizations. Only a hash of the token is stored.
create table upload_sessions (
  id text primary key,
  asset_id text not null references media_assets (id) on delete restrict,
  owner_did text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table videos (
  id text primary key,
  creator_id text not null references creators (id) on delete restrict,
  media_asset_id text not null references media_assets (id) on delete restrict,
  preview_asset_id text references media_assets (id) on delete restrict,
  poster_asset_id text references media_assets (id) on delete restrict,
  title text not null check (length(title) between 1 and 200),
  description text,
  category text,
  access_policy text not null check (access_policy in (
    'free', 'follower_only', 'subscriber_only', 'tier_required',
    'ppv_required', 'purchase_required', 'rental_required', 'custom')),
  required_tier_id text references subscription_tiers (id) on delete restrict,
  status text not null default 'draft' check (status in (
    'draft', 'published', 'quarantined', 'removed')),
  view_count bigint not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index videos_creator on videos (creator_id);
create index videos_status_published on videos (status, published_at desc);

-- Adult Continue Watching. One row per user per item. Adult context only.
create table adult_watch_progress (
  user_did text not null,
  resource_type text not null,
  resource_id text not null,
  position_ms int not null check (position_ms >= 0),
  duration_ms int check (duration_ms is null or duration_ms > 0),
  updated_at timestamptz not null default now(),
  primary key (user_did, resource_type, resource_id)
);

-- AdultWatchHistory: private, user-deletable (unlike orders/ledger/audit).
create table adult_watch_history (
  id text primary key,
  user_did text not null,
  resource_type text not null,
  resource_id text not null,
  watched_at timestamptz not null default now()
);
create index adult_watch_history_user on adult_watch_history (user_did, watched_at desc);

-- One counted view per user per item per 12h window (anti-inflation).
create table view_events (
  user_did text not null,
  resource_type text not null,
  resource_id text not null,
  window_start timestamptz not null,
  primary key (user_did, resource_type, resource_id, window_start)
);
