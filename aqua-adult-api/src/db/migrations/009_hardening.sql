-- FASE 15: indexes for the queries dashboards, analytics, moderation and
-- the media engine actually run. Additive only.
create index orders_offer on orders (offer_id);
create index orders_seller_confirmed on orders (seller_type, seller_id, confirmed_at);
create index subscriptions_tier on subscriptions (tier_id);
create index offers_resource on offers (resource_type, resource_id) where active;
create index offers_seller on offers (seller_type, seller_id);
create index videos_media_asset on videos (media_asset_id);
create index view_events_resource on view_events (resource_type, resource_id, window_start);
create index adult_watch_progress_resource on adult_watch_progress (resource_type, resource_id);
create index ledger_seller_time on ledger_entries (seller_type, seller_id, created_at);
create index live_reports_stream on live_reports (stream_id);
create index live_streams_creator on live_streams (creator_id);
create index live_streams_studio on live_streams (studio_id);
create index adult_resources_creator on adult_resources (creator_id);
create index episodes_season on episodes (season_id);
create index seasons_series on seasons (series_id);
create index moderation_actions_case on moderation_actions (case_id);
create index takedown_requests_case on takedown_requests (case_id);
create index payout_requests_open on payout_requests (status) where status in ('REQUESTED', 'APPROVED');
create index media_assets_status_time on media_assets (status, updated_at);

-- Payment events are append-only; the same must hold for provider
-- verification events.
create trigger verification_events_append_only before update or delete on verification_events
  for each row execute function forbid_mutation();
