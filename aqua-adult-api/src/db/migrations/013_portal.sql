-- Aqua +18 portal: adult-only catalog, external index, preferences,
-- consent attestations and a placeholder identity-verification status.
-- External rows are curated. This migration does not crawl the web.

alter table adult_accounts
  add column age_gate_status text not null default 'required'
    check (age_gate_status in ('required', 'self_declared', 'verified', 'denied'));

-- Placeholder for gov.br / Serpro Datavalid / Yoti. Nothing here contacts them.
alter table adult_accounts
  add column identity_verification_status text not null default 'pending'
    check (identity_verification_status in ('pending', 'verified', 'failed'));

create table portal_items (
  id text primary key,
  format text not null check (format in (
    'post', 'video', 'article', 'book', 'visionboard', 'web')),
  title text not null check (length(title) between 1 and 200),
  handle text not null check (length(handle) between 1 and 80),
  likes int not null default 0,
  comments int not null default 0,
  duration text,
  pinned boolean not null default false,
  trending boolean not null default false,
  categories text not null default '',
  tags text not null default '',
  -- The portal only stores adult content. A false flag cannot be inserted.
  adult boolean not null default true check (adult),
  status text not null default 'published' check (status in (
    'draft', 'pending_scan', 'published', 'quarantined', 'removed')),
  content_hash text,
  author_did text,
  created_at timestamptz not null default now()
);
create index portal_items_feed on portal_items (status, created_at desc);

create table external_index (
  id text primary key,
  title text not null check (length(title) between 1 and 200),
  domain text not null check (length(domain) between 1 and 253),
  url text not null check (length(url) between 8 and 500),
  snippet text not null check (length(snippet) between 1 and 500),
  category text not null check (category in (
    'Fotografia', 'Literatura', 'Portfólios', 'Saúde')),
  status text not null default 'indexed' check (status in (
    'pending_scan', 'indexed', 'quarantined', 'removed')),
  content_hash text,
  indexed_at timestamptz not null default now()
);

create table adult_portal_preferences (
  did text primary key,
  blur_thumbnails boolean not null default true,
  autoplay_videos boolean not null default false,
  hide_from_main boolean not null default true,
  confirm_external boolean not null default true,
  formats text not null default 'post,video,article,visionboard',
  categories text not null default 'artistico,literatura',
  muted_words text not null default '',
  updated_at timestamptz not null default now()
);

create table portal_consent_attestations (
  id text primary key,
  did text not null,
  resource_id text,
  statement text not null check (length(statement) between 8 and 500),
  attested_at timestamptz not null default now()
);

create table portal_reports (
  id text primary key,
  reporter_did text not null,
  resource_kind text not null check (resource_kind in ('portal_item', 'external_page', 'account')),
  resource_id text not null,
  reason_code text not null,
  case_id text references moderation_cases (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (reporter_did, resource_kind, resource_id)
);

-- Curated sample. Not the output of a crawler.
insert into portal_items
  (id, format, title, handle, likes, comments, duration, pinned, trending, categories, tags)
values
  ('pi-ensaio', 'post', 'Ensaio noturno — série completa', 'luna.art', 128, 34, null, false, true, 'artistico', 'ensaio,artistico'),
  ('pi-bastidores', 'video', 'Bastidores do estúdio', 'studio.k', 128, 34, '12:04', false, true, 'artistico', 'estudio'),
  ('pi-desejo', 'article', 'Sobre desejo e literatura', 'clara.le', 128, 34, null, false, true, 'literatura', 'literatura'),
  ('pi-mood', 'visionboard', 'Moodboard: veludo e luz', 'm.atelie', 128, 34, null, false, true, 'artistico', 'veludo'),
  ('pi-contos', 'book', 'Contos de madrugada - 14 cap.', 'r.autor', 128, 34, null, false, false, 'literatura', 'contos'),
  ('pi-galeria', 'web', 'Galeria independente', 'exemplo-galeria', 128, 34, null, true, false, 'artistico', 'galeria'),
  ('pi-noir', 'video', 'Sessão em preto e branco', 'noir.foto', 128, 34, '03:41', false, false, 'artistico', 'foto'),
  ('pi-serie', 'post', 'Nova série chegando sexta', 'duo.vibes', 128, 34, null, false, false, 'artistico', 'serie');

insert into external_index (id, title, domain, url, snippet, category) values
  ('ex-foto', 'Coleção de fotografia artística contemporânea', 'arte-exemplo.com', 'https://arte-exemplo.com',
    'Acervo curado de ensaios autorais, com créditos e licenças de cada fotógrafo.', 'Fotografia'),
  ('ex-forum', 'Fórum de literatura adulta', 'contos-exemplo.org', 'https://contos-exemplo.org',
    'Comunidade de escritores com contos, críticas e oficinas mensais.', 'Literatura'),
  ('ex-port', 'Portfólio de criador independente', 'criador-exemplo.net', 'https://criador-exemplo.net',
    'Trabalhos, agenda de lançamentos e links oficiais do criador.', 'Portfólios'),
  ('ex-revista', 'Revista sobre sexualidade e saúde', 'revista-exemplo.com.br', 'https://revista-exemplo.com.br',
    'Reportagens e guias revisados por especialistas.', 'Saúde');
