-- FASE 12: AQUA Live +18.

create table live_streams (
  id text primary key,
  creator_id text references creators (id) on delete restrict,
  studio_id text references studios (id) on delete restrict,
  title text not null check (length(title) between 1 and 200),
  description text,
  status text not null default 'SCHEDULED' check (status in (
    'SCHEDULED', 'STARTING', 'LIVE', 'ENDED', 'CANCELLED',
    'INTERRUPTED', 'QUARANTINED', 'REMOVED')),
  access_policy text not null check (access_policy in (
    'free', 'follower_only', 'subscriber_only', 'tier_required', 'ppv_required')),
  required_tier_id text references subscription_tiers (id) on delete restrict,
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  last_segment_at timestamptz,
  -- Only a hash of the stream key is stored; the key is shown once.
  stream_key_hash text not null unique,
  stream_key_rotated_at timestamptz not null default now(),
  recording_asset_id text references media_assets (id) on delete restrict,
  chat_enabled boolean not null default true,
  slow_mode_seconds int not null default 0 check (slow_mode_seconds between 0 and 600),
  peak_viewers int not null default 0,
  created_at timestamptz not null default now(),
  check ((creator_id is null) <> (studio_id is null))
);
create index live_streams_status on live_streams (status);

-- Viewer count = distinct authorized users with a heartbeat in the last 30s.
-- Media/segment requests never count.
create table live_viewer_sessions (
  stream_id text not null references live_streams (id) on delete restrict,
  user_did text not null,
  last_seen timestamptz not null default now(),
  primary key (stream_id, user_did)
);

-- Chat isolated from Social. Minimal data; purged after the stream ends.
create table live_chat_messages (
  id text primary key,
  stream_id text not null references live_streams (id) on delete restrict,
  author_did text not null,
  body text not null check (length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index live_chat_stream on live_chat_messages (stream_id, created_at);

create table live_chat_moderators (
  stream_id text not null references live_streams (id) on delete restrict,
  moderator_did text not null,
  primary key (stream_id, moderator_did)
);

-- mute = cannot chat until `until`; block = cannot chat or watch this stream.
create table live_bans (
  stream_id text not null references live_streams (id) on delete restrict,
  user_did text not null,
  kind text not null check (kind in ('mute', 'block')),
  until timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (stream_id, user_did, kind)
);

-- Structured reasons; FASE 14 turns these into moderation cases.
create table live_reports (
  id text primary key,
  stream_id text not null references live_streams (id) on delete restrict,
  reporter_did text not null,
  reason text not null check (reason in (
    'underage_suspected', 'non_consensual', 'illegal_content', 'harassment',
    'spam', 'impersonation', 'copyright', 'other')),
  details text check (details is null or length(details) <= 1000),
  created_at timestamptz not null default now()
);
