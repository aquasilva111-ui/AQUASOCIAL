import {type BskyAgent} from '@atproto/api'

import {
  type ConnectedAccount,
  type ContentPackage,
  type Launch,
  type LaunchDestination,
  type LaunchType,
  type ManagedProfile,
  type MediaAsset,
  type MediaVariantKind,
  type ProviderCapabilities,
  type ValidationIssue,
} from '#/lib/launch-hub/types'

export type AdapterContext = {
  /** Agent of the account currently active in the app. */
  agent: BskyAgent
  /**
   * OAuth credentials for the Mastodon instance targeted by an OAuth adapter
   * (Launch Hub phase 1). Kept out of the domain model on purpose: the vault
   * owns storage, this context only carries the short-lived session token.
   */
  mastodon?: {accessToken: string; instance: string}
}

export type ValidationInput = {
  type: LaunchType
  content: ContentPackage
  destination: Pick<LaunchDestination, 'customCaption' | 'customTitle'>
  profile: ManagedProfile
}

export type PublishJob = {
  launch: Launch
  destination: LaunchDestination
  profile: ManagedProfile
}

export type DestinationPreview = {
  title?: string
  text: string
  media: MediaAsset[]
  /** Graphemes/length of the text that will actually be sent. */
  textLength?: number
  /** Network limit the text must respect. */
  limit?: number
  /** True when the text has to be split into an automatic thread. */
  thread?: boolean
  /** First status of the automatic thread, when the text had to be split. */
  threadText?: string
  /** Alt text of the first image, when provided. */
  alt?: string
}

export type PublishResult = {
  remotePostId?: string
  remoteUrl?: string
  /** The job was handed to the server queue; status arrives later. */
  queued?: boolean
  /** True when the retry found an earlier attempt that already landed. */
  alreadyPublished?: boolean
}

/**
 * One adapter per provider family. Screens and the runner only talk to this
 * interface; provider-specific API logic never leaks into components.
 */
export interface ProviderAdapter {
  /** Whether this adapter can actually act right now (credentials, backend). */
  isConfigured(): boolean

  connect?(): Promise<{authorizeUrl: string} | void>
  disconnect?(account: ConnectedAccount): Promise<void>
  refreshAuth?(account: ConnectedAccount): Promise<void>

  /** Null when unknown — capabilities are never guessed. */
  getCapabilities(profile?: ManagedProfile): ProviderCapabilities | null

  validateContent(input: ValidationInput): ValidationIssue[]

  /** What this destination will actually receive; null if unknown. */
  renderPreview(input: ValidationInput): DestinationPreview | null

  /** Derive a destination variant; must not modify the master asset. */
  prepareMedia?(
    asset: MediaAsset,
    variant: MediaVariantKind,
  ): Promise<MediaAsset>

  publish(job: PublishJob, ctx: AdapterContext): Promise<PublishResult>
  schedule?(job: PublishJob, at: Date, ctx: AdapterContext): Promise<void>
  delete?(remotePostId: string, ctx: AdapterContext): Promise<void>
  getPublishStatus?(
    destination: LaunchDestination,
    ctx: AdapterContext,
  ): Promise<Pick<LaunchDestination, 'status' | 'remoteUrl' | 'error'>>
  getMetrics?(
    remotePostId: string,
    ctx: AdapterContext,
  ): Promise<Record<string, number>>
}
