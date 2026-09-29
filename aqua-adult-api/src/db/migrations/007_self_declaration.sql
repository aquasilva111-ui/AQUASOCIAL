-- Temporary +18 entry gate: self-declaration of majority.
-- Kept apart from age_verified_at on purpose: a declaration is NOT an age
-- verification and never sets it. Only what is needed is stored: when, and
-- which version of the entry policy text was accepted.
alter table adult_accounts add column self_declared_at timestamptz;
alter table adult_accounts add column self_declaration_policy_version text
  check (self_declaration_policy_version is null or length(self_declaration_policy_version) <= 40);
