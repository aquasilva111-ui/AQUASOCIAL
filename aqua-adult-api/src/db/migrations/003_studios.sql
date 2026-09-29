-- FASE 10: AQUA Studios +18. Titles reference MediaAssets; nothing duplicates video.

create table studios (
  id text primary key,
  owner_did text not null,
  name text not null check (length(name) between 1 and 100),
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  description text,
  avatar_asset_id text references media_assets (id) on delete restrict,
  banner_asset_id text references media_assets (id) on delete restrict,
  verification_status text not null default 'unverified' check (verification_status in (
    'unverified', 'pending', 'verified', 'suspended')),
  created_at timestamptz not null default now()
);

-- Least privilege: only OWNER/ADMIN sell and manage the team; EDITOR edits
-- titles; ANALYST reads numbers; MODERATOR handles community safety.
create table studio_members (
  studio_id text not null references studios (id) on delete restrict,
  member_did text not null,
  role text not null check (role in ('OWNER', 'ADMIN', 'EDITOR', 'ANALYST', 'MODERATOR')),
  added_at timestamptz not null default now(),
  primary key (studio_id, member_did)
);
create index studio_members_member on studio_members (member_did);

-- Shared release/availability/access columns for every title level.
create table movies (
  id text primary key,
  studio_id text not null references studios (id) on delete restrict,
  media_asset_id text references media_assets (id) on delete restrict,
  preview_asset_id text references media_assets (id) on delete restrict,
  poster_asset_id text references media_assets (id) on delete restrict,
  title text not null check (length(title) between 1 and 200),
  synopsis text,
  category text,
  access_policy text not null check (access_policy in (
    'free', 'follower_only', 'subscriber_only', 'tier_required',
    'ppv_required', 'purchase_required', 'rental_required', 'custom')),
  required_tier_id text references subscription_tiers (id) on delete restrict,
  status text not null default 'draft' check (status in (
    'draft', 'scheduled', 'published', 'unavailable', 'quarantined', 'removed', 'archived')),
  release_date date,
  availability_start timestamptz,
  availability_end timestamptz,
  allowed_regions text[] not null default '{}',
  view_count bigint not null default 0,
  created_at timestamptz not null default now()
);
create index movies_studio on movies (studio_id);

create table series (
  id text primary key,
  studio_id text not null references studios (id) on delete restrict,
  poster_asset_id text references media_assets (id) on delete restrict,
  title text not null check (length(title) between 1 and 200),
  synopsis text,
  category text,
  access_policy text not null check (access_policy in (
    'free', 'follower_only', 'subscriber_only', 'tier_required',
    'ppv_required', 'purchase_required', 'rental_required', 'custom')),
  required_tier_id text references subscription_tiers (id) on delete restrict,
  status text not null default 'draft' check (status in (
    'draft', 'scheduled', 'published', 'unavailable', 'quarantined', 'removed', 'archived')),
  availability_start timestamptz,
  availability_end timestamptz,
  allowed_regions text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index series_studio on series (studio_id);

-- Seasons/episodes inherit access policy from above when theirs is null.
create table seasons (
  id text primary key,
  series_id text not null references series (id) on delete restrict,
  number int not null check (number > 0),
  title text,
  access_policy text check (access_policy in (
    'free', 'follower_only', 'subscriber_only', 'tier_required',
    'ppv_required', 'purchase_required', 'rental_required', 'custom')),
  status text not null default 'draft' check (status in (
    'draft', 'scheduled', 'published', 'unavailable', 'quarantined', 'removed', 'archived')),
  unique (series_id, number)
);

create table episodes (
  id text primary key,
  season_id text not null references seasons (id) on delete restrict,
  number int not null check (number > 0),
  title text not null check (length(title) between 1 and 200),
  synopsis text,
  media_asset_id text references media_assets (id) on delete restrict,
  preview_asset_id text references media_assets (id) on delete restrict,
  access_policy text check (access_policy in (
    'free', 'follower_only', 'subscriber_only', 'tier_required',
    'ppv_required', 'purchase_required', 'rental_required', 'custom')),
  required_tier_id text references subscription_tiers (id) on delete restrict,
  status text not null default 'draft' check (status in (
    'draft', 'scheduled', 'published', 'unavailable', 'quarantined', 'removed', 'archived')),
  release_date date,
  availability_start timestamptz,
  availability_end timestamptz,
  view_count bigint not null default 0,
  unique (season_id, number)
);

create table collections (
  id text primary key,
  owner_type text not null check (owner_type in ('studio', 'creator')),
  owner_id text not null,
  title text not null check (length(title) between 1 and 200),
  description text,
  access_policy text not null default 'free' check (access_policy in (
    'free', 'subscriber_only', 'purchase_required', 'ppv_required', 'rental_required', 'custom')),
  status text not null default 'draft' check (status in (
    'draft', 'published', 'unavailable', 'quarantined', 'removed', 'archived')),
  created_at timestamptz not null default now()
);

create table collection_items (
  collection_id text not null references collections (id) on delete restrict,
  item_type text not null check (item_type in ('movie', 'series', 'season', 'episode', 'video')),
  item_id text not null,
  position int not null default 0,
  primary key (collection_id, item_type, item_id)
);
create index collection_items_item on collection_items (item_type, item_id);

-- Credits show only what was authorized for publication. A credited person
-- need not have an AQUA profile; nothing is inferred about real identity.
create table production_credits (
  id text primary key,
  item_type text not null check (item_type in ('movie', 'series', 'episode')),
  item_id text not null,
  role text not null check (length(role) between 1 and 60),
  display_name text not null check (length(display_name) between 1 and 100),
  entity_type text not null check (entity_type in ('aqua_profile', 'external')),
  entity_did text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index production_credits_item on production_credits (item_type, item_id);
