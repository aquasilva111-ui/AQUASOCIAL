import {
  type Provider,
  type ProviderCategory,
  type ProviderId,
} from '#/lib/launch-hub/types'

/**
 * Provider registry. Adding a provider means adding an entry here and an
 * adapter; screens iterate this list and never special-case networks.
 */
export const PROVIDERS: Provider[] = [
  // OWNED
  {
    id: 'aqua',
    name: 'AQUA',
    category: 'owned',
    adapter: 'atproto-session',
    monogram: 'AQ',
    color: '#002bef',
  },
  {
    id: 'website',
    name: 'Website',
    category: 'owned',
    adapter: 'integration-api',
    monogram: 'WWW',
    color: '#4b5563',
  },
  // SOCIAL
  {
    id: 'tiktok',
    name: 'TikTok',
    category: 'social',
    adapter: 'integration-api',
    monogram: 'TT',
    color: '#111111',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    adapter: 'integration-api',
    monogram: 'IG',
    color: '#d62976',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    category: 'social',
    adapter: 'integration-api',
    monogram: 'FB',
    color: '#1877f2',
  },
  {
    id: 'threads',
    name: 'Threads',
    category: 'social',
    adapter: 'integration-api',
    monogram: 'TH',
    color: '#222222',
  },
  {
    id: 'x',
    name: 'X',
    category: 'social',
    adapter: 'integration-api',
    monogram: 'X',
    color: '#000000',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'social',
    adapter: 'integration-api',
    monogram: 'in',
    color: '#0a66c2',
  },
  {
    id: 'bluesky',
    name: 'Bluesky',
    category: 'social',
    adapter: 'same-network',
    sameNetworkAs: 'aqua',
    monogram: 'BS',
    color: '#1185fe',
  },
  {
    id: 'tumblr',
    name: 'Tumblr',
    category: 'social',
    adapter: 'integration-api',
    monogram: 't',
    color: '#36465d',
  },
  // VIDEO
  {
    id: 'youtube',
    name: 'YouTube',
    category: 'video',
    adapter: 'integration-api',
    monogram: 'YT',
    color: '#ff0000',
  },
  // VISUAL
  {
    id: 'pinterest',
    name: 'Pinterest',
    category: 'visual',
    adapter: 'integration-api',
    monogram: 'P',
    color: '#e60023',
  },
  // WRITING
  {
    id: 'wattpad',
    name: 'Wattpad',
    category: 'writing',
    adapter: 'integration-api',
    monogram: 'W',
    color: '#ff500a',
  },
  // MUSIC
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    category: 'music',
    adapter: 'integration-api',
    monogram: 'SC',
    color: '#ff5500',
  },
  {
    id: 'bandlab',
    name: 'BandLab',
    category: 'music',
    adapter: 'integration-api',
    monogram: 'BL',
    color: '#f12c18',
  },
]

export const CATEGORY_ORDER: ProviderCategory[] = [
  'social',
  'video',
  'visual',
  'writing',
  'music',
  'owned',
]

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  social: 'Social',
  video: 'Vídeo',
  visual: 'Visual',
  writing: 'Escrita',
  music: 'Música',
  owned: 'Canais próprios',
}

const byId = new Map(PROVIDERS.map(p => [p.id, p]))

export function getProvider(id: ProviderId): Provider {
  const provider = byId.get(id)
  if (!provider) throw new Error(`Unknown Launch Hub provider: ${id}`)
  return provider
}

export function providersByCategory() {
  return CATEGORY_ORDER.map(category => ({
    category,
    label: CATEGORY_LABELS[category],
    providers: PROVIDERS.filter(p => p.category === category),
  }))
}
