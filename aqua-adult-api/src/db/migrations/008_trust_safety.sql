-- FASE 14: AQUA Trust & Safety. Additive only.

-- ------------------------------------------------------------ staff RBAC
-- Separate, least-privilege staff roles — no single "isAdmin".
create table staff_roles (
  did text not null,
  role text not null check (role in (
    'SUPPORT', 'MODERATOR', 'SENIOR_MODERATOR', 'TRUST_SAFETY',
    'FINANCE', 'ADMIN', 'SUPERADMIN')),
  granted_by text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (did, role)
);

-- ------------------------------------------------------------ account sanctions
alter table adult_accounts add column banned_at timestamptz;
alter table adult_accounts add column ban_case_id text;

-- ------------------------------------------------------------ creator verification
-- Application → Identity → Age → Agreement → Review → Approved/Rejected.
-- Only provider results and staff decisions move it; never the frontend.
-- Identity documents are never stored: only the provider's reference.
create table creator_applications (
  id text primary key,
  did text not null,
  handle text,
  status text not null default 'IDENTITY_PENDING' check (status in (
    'IDENTITY_PENDING', 'AGE_PENDING', 'AGREEMENT_PENDING', 'IN_REVIEW',
    'APPROVED', 'REJECTED', 'WITHDRAWN')),
  identity_verification_ref text,
  identity_verified_at timestamptz,
  agreement_version text,
  agreement_accepted_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index creator_applications_open on creator_applications (did)
  where status not in ('APPROVED', 'REJECTED', 'WITHDRAWN');

-- ------------------------------------------------------------ consent / rights
-- Private records: never returned by public endpoints. subject_ref and
-- document_ref are opaque pointers (e.g. a verification provider reference
-- or a private storage key), not names or public URLs.
create table consent_records (
  id text primary key,
  resource_type text not null,
  resource_id text not null,
  kind text not null check (kind in (
    'performer_consent', 'content_rights', 'production_authorization')),
  subject_ref text not null check (length(subject_ref) between 1 and 200),
  document_ref text check (document_ref is null or length(document_ref) <= 500),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED', 'DISPUTED')),
  submitted_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index consent_records_resource on consent_records (resource_type, resource_id);

-- ------------------------------------------------------------ moderation cases
create table moderation_cases (
  id text primary key,
  source text not null check (source in (
    'report', 'takedown', 'dispute', 'consent', 'hash_match', 'staff',
    'appeal', 'emergency', 'creator_review')),
  resource_type text not null,
  resource_id text not null,
  reason_code text,
  status text not null default 'OPEN' check (status in (
    'OPEN', 'REVIEWING', 'ACTION_REQUIRED', 'RESOLVED', 'DISMISSED', 'ESCALATED')),
  priority int not null check (priority between 1 and 4),
  assigned_to text,
  parent_case_id text references moderation_cases (id) on delete restrict,
  report_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index moderation_cases_queue on moderation_cases (status, priority, created_at);
create index moderation_cases_resource on moderation_cases (resource_type, resource_id);
-- Reports about the same item pile onto one open case.
create unique index moderation_cases_open_report on moderation_cases (resource_type, resource_id)
  where source = 'report' and status in ('OPEN', 'REVIEWING', 'ACTION_REQUIRED', 'ESCALATED');

-- ------------------------------------------------------------ reports
-- Structured, configurable reasons; free text is only extra context.
create table report_reasons (
  code text primary key,
  label text not null,
  target_types text[] not null,
  priority int not null check (priority between 1 and 4),
  requires_details boolean not null default false,
  active boolean not null default true
);
insert into report_reasons (code, label, target_types, priority, requires_details) values
  ('underage_suspected', 'Suspeita de menor de idade', '{content,creator,user,message,live,studio,production}', 1, false),
  ('non_consensual', 'Conteúdo não consensual', '{content,creator,live,studio,production}', 1, false),
  ('illegal_content', 'Conteúdo ilegal', '{content,creator,user,message,live,studio,production}', 1, false),
  ('violence_threat', 'Ameaça ou violência', '{content,creator,user,message,live,studio,production}', 2, false),
  ('privacy_violation', 'Exposição de dados privados', '{content,creator,user,message,live,studio,production}', 2, false),
  ('harassment', 'Assédio', '{content,creator,user,message,live,studio}', 2, false),
  ('hate', 'Discurso de ódio', '{content,creator,user,message,live,studio,production}', 2, false),
  ('impersonation', 'Falsidade ideológica', '{creator,user,live,studio}', 3, false),
  ('copyright', 'Direitos autorais', '{content,live,studio,production}', 3, false),
  ('scam_fraud', 'Golpe ou fraude', '{content,creator,user,message,live,studio}', 3, false),
  ('spam', 'Spam', '{content,creator,user,message,live,studio}', 4, false),
  ('other', 'Outro', '{content,creator,user,message,live,studio,production}', 4, false);

create table reports (
  id text primary key,
  reporter_did text not null,
  target_type text not null check (target_type in (
    'content', 'creator', 'user', 'message', 'live', 'studio', 'production')),
  resource_type text not null,
  resource_id text not null,
  reason_code text not null references report_reasons (code) on delete restrict,
  details text check (details is null or length(details) <= 1000),
  case_id text not null references moderation_cases (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index reports_reporter on reports (reporter_did, created_at desc);
create index reports_case on reports (case_id);

-- ------------------------------------------------------------ actions & decisions
-- Append-only: history is never rewritten. A restore is a new action.
create table moderation_actions (
  id text primary key,
  case_id text not null references moderation_cases (id) on delete restrict,
  action text not null check (action in (
    'restrict', 'quarantine', 'remove', 'suspend', 'ban', 'restore',
    'age_restrict', 'region_restrict', 'revoke_creator', 'lift_restriction')),
  resource_type text not null,
  resource_id text not null,
  actor_did text not null,
  reason text not null check (length(reason) between 3 and 2000),
  params jsonb not null default '{}',
  previous_state jsonb,
  reverses_action_id text references moderation_actions (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index moderation_actions_resource on moderation_actions (resource_type, resource_id, created_at desc);

create table moderation_decisions (
  id text primary key,
  case_id text not null references moderation_cases (id) on delete restrict,
  decision text not null check (decision in (
    'no_violation', 'violation', 'partial_violation', 'appeal_upheld', 'appeal_overturned')),
  actor_did text not null,
  reason text not null check (length(reason) between 3 and 2000),
  appeal_id text,
  created_at timestamptz not null default now()
);
create index moderation_decisions_case on moderation_decisions (case_id);

-- An appeal opens a new case linked to the original; nothing is overwritten.
create table appeals (
  id text primary key,
  case_id text not null references moderation_cases (id) on delete restrict,
  decision_id text not null references moderation_decisions (id) on delete restrict,
  appellant_did text not null,
  statement text not null check (length(statement) between 10 and 2000),
  status text not null default 'OPEN' check (status in ('OPEN', 'UPHELD', 'OVERTURNED')),
  appeal_case_id text not null references moderation_cases (id) on delete restrict,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (decision_id, appellant_did)
);

-- Active restrictions consulted by the Entitlements check.
create table moderation_restrictions (
  id text primary key,
  resource_type text not null,
  resource_id text not null,
  kind text not null check (kind in ('restrict', 'age_restrict', 'region_restrict')),
  regions text[] not null default '{}',
  case_id text not null references moderation_cases (id) on delete restrict,
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz
);
create index moderation_restrictions_active on moderation_restrictions (resource_type, resource_id) where active;

-- ------------------------------------------------------------ takedowns
create table takedown_requests (
  id text primary key,
  requester_did text,
  -- How to answer the requester; visible to Trust & Safety only.
  requester_contact text check (requester_contact is null or length(requester_contact) <= 320),
  resource_type text not null,
  resource_id text not null,
  -- 'ownership' = ownership dispute between parties (case source 'dispute').
  basis text not null check (basis in (
    'copyright', 'non_consensual', 'privacy', 'illegal', 'ownership', 'other')),
  details text not null check (length(details) between 10 and 5000),
  status text not null default 'RECEIVED' check (status in (
    'RECEIVED', 'IN_REVIEW', 'RESTRICTED', 'ACTIONED', 'REJECTED', 'APPEALED')),
  case_id text not null references moderation_cases (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Verification provider webhooks: each event applies once.
create table verification_events (
  provider text not null,
  event_id text not null,
  kind text not null check (kind in ('age', 'identity')),
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- ------------------------------------------------------------ blocks
-- Server-side user block for the +18 context (feed, creator pages, live
-- chat, recommendations, discovery). Independent from the social graph.
create table adult_blocks (
  blocker_did text not null,
  blocked_did text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_did, blocked_did),
  check (blocker_did <> blocked_did)
);
create index adult_blocks_blocked on adult_blocks (blocked_did);

create trigger moderation_actions_append_only before update or delete on moderation_actions
  for each row execute function forbid_mutation();
create trigger moderation_decisions_append_only before update or delete on moderation_decisions
  for each row execute function forbid_mutation();
