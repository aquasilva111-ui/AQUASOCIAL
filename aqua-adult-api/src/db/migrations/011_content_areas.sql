-- Phase 17b: Visionboard +18 (image boards) and Reads +18 (serial stories).
-- Drops +18 reuses `videos.preview_asset_id`, so it needs no new table.
-- Additive only.

create table adult_boards (
  id text primary key,
  owner_did text not null,
  name text not null check (length(name) between 1 and 80),
  -- Private by default: a board is never visible to anyone else until the
  -- owner makes it public (and then only to age-verified +18 users).
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now()
);
create index adult_boards_owner on adult_boards (owner_did, created_at desc);

create table adult_board_items (
  id text primary key,
  board_id text not null references adult_boards (id) on delete cascade,
  media_asset_id text not null references media_assets (id) on delete restrict,
  tone text not null default 'neutral' check (tone in ('warm', 'cool', 'neutral')),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (board_id, media_asset_id)
);
create index adult_board_items_board on adult_board_items (board_id, created_at desc);

create table adult_books (
  id text primary key,
  creator_id text not null references creators (id) on delete restrict,
  title text not null check (length(title) between 1 and 200),
  description text check (description is null or length(description) <= 5000),
  status text not null default 'draft' check (status in ('draft', 'published', 'removed')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index adult_books_published on adult_books (published_at desc) where status = 'published';
create index adult_books_creator on adult_books (creator_id);

-- Hard rule, enforced by the database itself: no character under 18.
create table adult_book_characters (
  id text primary key,
  book_id text not null references adult_books (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  age int not null check (age >= 18),
  unique (book_id, name)
);

create table adult_book_parts (
  book_id text not null references adult_books (id) on delete cascade,
  number int not null check (number > 0),
  title text check (title is null or length(title) <= 200),
  body text not null check (length(body) between 1 and 60000),
  created_at timestamptz not null default now(),
  primary key (book_id, number)
);
