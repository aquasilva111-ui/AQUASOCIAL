-- AQUA +18 social network core: profiles, posts, and engagement (likes,
-- reposts, comments) that works on every kind of +18 content. Additive only.
-- Everything is keyed by DID and lives apart from the public AQUA graph.

create table adult_profiles (
  user_did text primary key,
  display_name text check (display_name is null or length(display_name) <= 60),
  bio text check (bio is null or length(bio) <= 500),
  updated_at timestamptz not null default now()
);

create table adult_posts (
  id text primary key,
  author_did text not null,
  body text not null default '' check (length(body) <= 3000),
  status text not null default 'published' check (status in ('published', 'quarantined', 'removed')),
  created_at timestamptz not null default now()
);
create index adult_posts_time on adult_posts (created_at desc, id desc) where status = 'published';
create index adult_posts_author on adult_posts (author_did, created_at desc);

create table adult_post_media (
  post_id text not null references adult_posts (id) on delete cascade,
  media_asset_id text not null references media_assets (id) on delete restrict,
  position int not null check (position between 0 and 3),
  primary key (post_id, media_asset_id)
);

-- Engagement targets: 'post' (adult_posts), 'video' (Views), 'book' (Reads)
-- and 'pin' (a public Visionboard item).
create table adult_likes (
  user_did text not null,
  target_type text not null check (target_type in ('post', 'video', 'book', 'pin')),
  target_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_did, target_type, target_id)
);
create index adult_likes_target on adult_likes (target_type, target_id);

create table adult_reposts (
  user_did text not null,
  target_type text not null check (target_type in ('post', 'video', 'book', 'pin')),
  target_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_did, target_type, target_id)
);
create index adult_reposts_target on adult_reposts (target_type, target_id);
create index adult_reposts_user on adult_reposts (user_did, created_at desc);

create table adult_comments (
  id text primary key,
  author_did text not null,
  target_type text not null check (target_type in ('post', 'video', 'book', 'pin')),
  target_id text not null,
  body text not null check (length(body) between 1 and 1000),
  status text not null default 'published' check (status in ('published', 'quarantined', 'removed')),
  created_at timestamptz not null default now()
);
create index adult_comments_target on adult_comments (target_type, target_id, created_at);
create index adult_comments_author on adult_comments (author_did, created_at desc);
