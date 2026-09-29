import {
  type ConnectedAccount,
  type Launch,
  type LaunchDestination,
  type ManagedProfile,
  type ProviderCapabilities,
  type ProviderId,
} from '#/lib/launch-hub/types'

/**
 * Contract for the AQUA Integration API: the server side that owns the
 * encrypted credential vault, OAuth flows, the job queue/workers and the
 * scheduler. The browser only ever sees opaque account/profile ids — never
 * provider tokens.
 *
 *   Frontend → AQUA Integration API → credential vault → provider API
 *
 * External providers (everything except AQUA itself) and server-side
 * scheduling only light up once a real implementation is plugged in here.
 */
export interface IntegrationBackend {
  isConfigured(): boolean
  listConnections(): Promise<{
    accounts: ConnectedAccount[]
    profiles: ManagedProfile[]
  }>
  /** Starts an OAuth (or equivalent) flow; returns where to send the user. */
  beginConnect(provider: ProviderId): Promise<{authorizeUrl: string}>
  reconnect(accountId: string): Promise<{authorizeUrl: string}>
  disconnect(accountId: string): Promise<void>
  getCapabilities(profileKey: string): Promise<ProviderCapabilities>
  /** Hands destinations to the server queue, for now or `launch.publishAt`. */
  enqueue(launch: Launch, destinationIds: string[]): Promise<void>
  getDestinationStatus(
    launchId: string,
  ): Promise<
    Pick<
      LaunchDestination,
      'id' | 'status' | 'remotePostId' | 'remoteUrl' | 'error'
    >[]
  >
}

export class IntegrationNotConfiguredError extends Error {
  constructor() {
    super('A API de integração do AQUA ainda não está configurada.')
  }
}

const notConfigured = () => Promise.reject(new IntegrationNotConfiguredError())

const unconfiguredBackend: IntegrationBackend = {
  isConfigured: () => false,
  listConnections: () => Promise.resolve({accounts: [], profiles: []}),
  beginConnect: notConfigured,
  reconnect: notConfigured,
  disconnect: notConfigured,
  getCapabilities: notConfigured,
  enqueue: notConfigured,
  getDestinationStatus: notConfigured,
}

export const integrationBackend: IntegrationBackend = unconfiguredBackend
