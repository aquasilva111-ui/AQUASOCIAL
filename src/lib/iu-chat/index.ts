const embed = require('./embed.js') as {
  DEFAULT_IU_CHAT_URL: string
  PROBE_PATH: string
  normalizeIuChatUrl: (raw?: string) => string
  iuChatUpstream: () => string
  isSameSite: (aquaOrigin: string, chatUrl: string) => boolean
  assessIuChatEmbed: (input: {
    aquaOrigin: string
    chatUrl: string
    xFrameOptions?: string | null
    contentSecurityPolicy?: string | null
  }) => {frameable: boolean; sameSite: boolean}
  decideIuChatView: (input: {
    reachable: boolean
    frameable: boolean
    sameSite: boolean
    framingKnown: boolean
    native: boolean
  }) => 'embed' | 'down' | 'cross-site' | 'framing'
}

export const DEFAULT_IU_CHAT_URL = embed.DEFAULT_IU_CHAT_URL
export const IU_CHAT_PROBE_PATH = embed.PROBE_PATH
export const normalizeIuChatUrl = embed.normalizeIuChatUrl
export const iuChatUpstream = embed.iuChatUpstream
export const isSameSite = embed.isSameSite
export const assessIuChatEmbed = embed.assessIuChatEmbed
export const decideIuChatView = embed.decideIuChatView

export type IuChatView = ReturnType<typeof decideIuChatView>
