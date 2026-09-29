/**
 * Launch Hub domain model.
 *
 * One connection authenticates (ConnectedAccount), one managed profile is a
 * destination (ManagedProfile), one identity groups profiles (IdentityGroup),
 * one launch distributes (Launch), and each destination inside it is an
 * independent job (LaunchDestination). Provider specifics live in adapters.
 */

export type ProviderId =
  | 'aqua'
  | 'bluesky'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'threads'
  | 'x'
  | 'linkedin'
  | 'tumblr'
  | 'youtube'
  | 'pinterest'
  | 'wattpad'
  | 'soundcloud'
  | 'bandlab'
  | 'website'

export type ProviderCategory =
  | 'social'
  | 'video'
  | 'visual'
  | 'writing'
  | 'music'
  | 'owned'

/**
 * Everything a destination might accept. Adapters declare the subset they
 * actually support; nothing here is assumed for a provider by default.
 */
export type Capability =
  | 'text'
  | 'image'
  | 'multi_image'
  | 'carousel'
  | 'short_video'
  | 'long_video'
  | 'audio'
  | 'livestream'
  | 'article'
  | 'page'
  | 'product'
  | 'thread'
  | 'alt_text'
  | 'link'
  | 'scheduling'
  | 'analytics'

export type CapabilityLimits = {
  maxTextGraphemes?: number
  maxImages?: number
  maxTitleLength?: number
}

export type ProviderCapabilities = {
  supports: Capability[]
  limits: CapabilityLimits
}

export type Provider = {
  id: ProviderId
  name: string
  category: ProviderCategory
  /** Which adapter implementation handles this provider. */
  adapter: 'atproto-session' | 'integration-api' | 'same-network'
  /** Short monogram used for the provider badge. */
  monogram: string
  color: string
  /** For `same-network` providers: the provider whose posts already land here. */
  sameNetworkAs?: ProviderId
}

export type ConnectionStatus =
  | 'connected'
  | 'needs_reconnect'
  | 'revoked'
  | 'not_configured'

/** A concrete authentication with a provider. Never holds raw tokens. */
export type ConnectedAccount = {
  id: string
  provider: ProviderId
  label: string
  status: ConnectionStatus
  scopes: string[]
  /** Opaque reference into the server-side credential vault, if any. */
  credentialRef?: string
  lastSyncedAt?: string
}

export type ProfileType = 'personal' | 'professional' | 'brand' | 'client'

/** The page/channel/profile that actually receives a publication. */
export type ManagedProfile = {
  /** Stable key: `${provider}:${externalProfileId}` */
  key: string
  provider: ProviderId
  connectedAccountId: string
  externalProfileId: string
  displayName: string
  handle?: string
  avatar?: string
  type: ProfileType
  status: ConnectionStatus
  permissions: string[]
  /** Set when the profile is known but can't publish from here right now. */
  unavailableReason?: string
}

/** A brand or person grouping presences across providers. */
export type IdentityGroup = {
  id: string
  name: string
  profileKeys: string[]
  createdAt: string
}

export type LaunchType =
  | 'social_post'
  | 'video_release'
  | 'music_release'
  | 'book_release'
  | 'article'
  | 'product_launch'
  | 'app_release'
  | 'campaign'

export type MediaKind = 'image' | 'video' | 'audio'
export type MediaRole = 'master' | 'cover' | 'thumbnail' | 'attachment'
export type MediaVariantKind =
  | 'original'
  | 'vertical'
  | 'square'
  | 'thumbnail'
  | 'audio'
  | 'preview'

/**
 * Master asset reference. Variants are derived from it per destination;
 * the master itself is never modified.
 */
export type MediaAsset = {
  id: string
  kind: MediaKind
  role: MediaRole
  mime: string
  width?: number
  height?: number
  size?: number
  alt?: string
  /**
   * Persistable location. Browser-only data/blob URLs are kept in the
   * in-memory media cache instead (see media-cache.ts).
   */
  uri?: string
}

export type MusicReleaseMetadata = {
  artist?: string
  albumOrSingle?: 'single' | 'ep' | 'album'
  albumTitle?: string
  genre?: string
  credits?: string
  lyrics?: string
  releaseDate?: string
}

/** One master package per launch; destinations may override parts of it. */
export type ContentPackage = {
  /** Promotional/social text. */
  text: string
  title?: string
  description?: string
  link?: string
  tags?: string[]
  media: MediaAsset[]
  music?: MusicReleaseMetadata
}

export type DestinationStatus =
  | 'pending'
  | 'scheduled'
  | 'processing'
  | 'published'
  | 'failed'
  | 'skipped'

export type LaunchDestination = {
  id: string
  launchId: string
  provider: ProviderId
  profileKey: string
  customCaption?: string
  customTitle?: string
  mediaVariant?: MediaVariantKind
  metadataOverrides?: Record<string, string>
  status: DestinationStatus
  /**
   * Idempotency key. Adapters derive the remote identifier from it so a
   * retry can detect an earlier successful attempt instead of reposting.
   */
  idempotencyKey: string
  attempts: number
  remotePostId?: string
  remoteUrl?: string
  error?: string
  updatedAt: string
}

export type LaunchStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'partial'
  | 'failed'

export type Launch = {
  id: string
  creatorDid: string
  identityGroupId?: string
  type: LaunchType
  contentPackage: ContentPackage
  destinations: LaunchDestination[]
  publishMode: 'now' | 'schedule'
  publishAt?: string
  status: LaunchStatus
  createdAt: string
  updatedAt: string
}

export type ValidationLevel = 'ready' | 'warning' | 'blocked'

export type ValidationIssue = {
  level: Exclude<ValidationLevel, 'ready'>
  message: string
}

export type DestinationValidation = {
  level: ValidationLevel
  issues: ValidationIssue[]
}
