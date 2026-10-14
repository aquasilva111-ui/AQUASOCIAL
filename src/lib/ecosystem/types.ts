/** Shared contracts: identities are AT DIDs; content is referenced, never copied. */
export type Did = `did:${string}`
export type Visibility = 'public' | 'private' | 'unlisted'
export type ResourceKind =
  | 'community'
  | 'portal'
  | 'app'
  | 'broadcast'
  | 'workspace'
  | 'verification'
export type ContentType =
  | 'post'
  | 'video'
  | 'image'
  | 'book'
  | 'music'
  | 'doc'
  | 'app'
  | 'dataset'
  | 'source'
export type ContentRef = {
  type: ContentType
  uri: string
  title: string
  source?: string
}
export type MemberRole =
  | 'owner'
  | 'admin'
  | 'editor'
  | 'researcher'
  | 'contributor'
  | 'moderator'
  | 'viewer'
export type Member = {did: Did; role: MemberRole}
export type CommunityChannel = {
  id: string
  name: string
  type: 'text' | 'forum' | 'media' | 'announcements'
  posts: {uri: string; authorDid: Did; pinned: boolean; createdAt: string}[]
}
export type Community = {
  members: Member[]
  channels: CommunityChannel[]
  bannedDids: Did[]
}
export type PortalSection =
  | 'overview'
  | 'research'
  | 'sources'
  | 'documents'
  | 'data'
  | 'timeline'
  | 'discussions'
  | 'people'
  | 'organizations'
  | 'media'
  | 'conventions'
  | 'related'
export type SourcedFact = {value: string; source: string; retrievedAt: string}
export type Portal = {
  members: Member[]
  topics: string[]
  languages: string[]
  regions: string[]
  sections: Partial<Record<PortalSection, ContentRef[]>>
  country?: {countryCode: string; facts: Record<string, SourcedFact>}
}
export const APP_PERMISSIONS = [
  'storage',
  'network',
  'camera',
  'microphone',
  'notifications',
  'profile.read',
] as const
export type AppPermission = (typeof APP_PERMISSIONS)[number]
export type AppManifest = {
  id: string
  ownerDid: Did
  name: string
  slug: string
  version: string
  description: string
  icon?: string
  /** HTTPS JavaScript bundle produced by an external build/deployment. */
  entry: string
  permissions: AppPermission[]
  runtime: 'web' | 'wasm' | 'webgl'
  projectId?: string
  createdAt: string
  updatedAt: string
}
export type ScheduleItem = {
  id: string
  channelId: string
  title: string
  description: string
  startAt: string
  endAt: string
  mediaUri?: string
  liveSource?: string
}
export type BroadcastChannel = {
  type: 'video' | 'radio'
  schedule: ScheduleItem[]
  followers: Did[]
}
export type ContextLayer = 'GLOBAL' | 'PROJECT' | 'TASK' | 'TEMPORARY'
export type Decision = {
  id: string
  text: string
  authorDid: Did
  createdAt: string
}
export type WorkspaceTask = {
  id: string
  title: string
  status: 'pending' | 'running' | 'completed' | 'blocked' | 'NEEDS_DECISION'
  result?: string
}
export type AutomatonStatus =
  | 'NASCENT'
  | 'EQUIPPED'
  | 'RUNNING'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'FAILED'
  | 'DISINTEGRATED'
export type Automaton = {
  id: string
  mission: string
  territory: string[]
  capabilities: string[]
  permissions: {
    read: string[]
    write: string[]
    execute: string[]
    denied: string[]
  }
  limits: {maxSteps: number; maxDurationMs: number; maxExternalCalls: number}
  successCondition: string
  status: AutomatonStatus
  startedAt?: string
  finishedAt?: string
  logs: string[]
  result?: string
  blockedReason?: string
}
export type Workspace = {
  messages?: {
    id: string
    role: 'user' | 'assistant'
    text: string
    provider?: string
    createdAt: string
  }[]
  context: Partial<Record<ContextLayer, string>>
  decisions: Decision[]
  tasks: WorkspaceTask[]
  files: ContentRef[]
  linkedRepos: string[]
  linkedServices: string[]
  automata: Automaton[]
}
export const ENTITY_TYPES = [
  'person',
  'creator',
  'company',
  'brand',
  'organization',
  'government',
  'government_agency',
  'university',
  'news_organization',
  'public_figure',
] as const
export type VerificationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'needs_information'
  | 'approved'
  | 'rejected'
  | 'revoked'
export type VerificationRequest = {
  applicantDid: Did
  entityType: (typeof ENTITY_TYPES)[number]
  legalName: string
  displayName: string
  website: string
  country: string
  /** Only references to official sources. Private uploads require a secure document vault. */
  evidence: {
    type:
      | 'website'
      | 'domain'
      | 'official_email'
      | 'social_account'
      | 'registry'
    reference: string
  }[]
  status: VerificationStatus
  reviewerDid?: Did
  reviewNotes?: string
  verificationUri?: string
}
export type ResourceData =
  | Community
  | Portal
  | AppManifest
  | BroadcastChannel
  | Workspace
  | VerificationRequest
export type EcosystemResource = {
  id: string
  kind: ResourceKind
  ownerDid: Did
  slug: string
  name: string
  description: string
  visibility: Visibility
  createdAt: string
  updatedAt: string
  revision: number
  data: ResourceData
}
export type CreatorProfileSummary = {
  did: Did
  contentTypes: ContentType[]
  recentWorks: ContentRef[]
  followers?: number
  activity: number
  /** Absence of evidence is not an offline/closed claim. */
  liveStatus: 'live' | 'unknown'
  storeStatus: 'configured' | 'unknown'
}
export type MonetizationSource =
  | 'shop'
  | 'subscription'
  | 'ppv'
  | 'creator_support'
  | 'book'
  | 'app'
  | 'broadcast'
  | 'adult'
export type MonetizationEntry = {
  id: string
  ownerDid: Did
  sourceType: MonetizationSource
  sourceId: string
  gross: number
  fees: number
  net: number
  currency: string
  status: 'pending' | 'available' | 'paid' | 'refunded'
  createdAt: string
}
export type WalletSummary = {
  ownerDid: Did
  pending: number
  available: number
  paid: number
  currency: string
}
export const ANALYTICS_EVENTS = [
  'impression',
  'click',
  'view',
  'play',
  'pause',
  'watch_time',
  'completion',
  'like',
  'reply',
  'repost',
  'save',
  'follow',
  'share',
  'purchase',
  'subscribe',
  'open_app',
  'open_book',
  'read',
  'live_join',
  'live_leave',
] as const
export type AnalyticsEvent = {
  id: string
  actorDid?: Did
  event: (typeof ANALYTICS_EVENTS)[number]
  resourceType: string
  resourceId: string
  context: {surface?: string; durationMs?: number}
  timestamp: string
}
export type AuditEvent = {
  id: string
  actorDid: Did
  action: string
  resourceId: string
  timestamp: string
}
export type EcosystemCapabilities = {
  storage: boolean
  authentication: boolean
  moderation: boolean
  verificationIssuer: boolean
  appRunner: boolean
  payments: boolean
  aiProviders: string[]
  reviewer: boolean
}
