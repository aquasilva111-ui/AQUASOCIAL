export type Signal =
  | 'postVolume'
  | 'uniqueAuthors'
  | 'likes'
  | 'replies'
  | 'reposts'
  | 'saves'
  | 'clicks'
  | 'videoViews'
  | 'watchTime'
  | 'liveViewers'
  | 'communityActivity'
  | 'creatorGrowth'
  | 'velocity'
  | 'acceleration'
  | 'proximity'
  | 'freshness'
  | 'trust'
  | 'spam'
  | 'duplicates'
export type TopicCluster = {
  id: string
  canonicalLabel: string
  aliases: string[]
  keywords: string[]
  entities: string[]
  language?: string
  regions: string[]
  firstSeenAt: string
  lastSeenAt: string
  postCount: number
  uniqueAuthors: number
  velocity: number
  engagementVelocity?: number
  confidence: number
  metrics: Partial<Record<Signal, number>>
  source: string
  href: string
}
export type ChartDefinition = {
  id: string
  title: string
  description: string
  scope: string
  signals: Signal[]
  weights: Partial<Record<Signal, number>>
  filters: {minAuthors: number; minConfidence: number}
  timeWindow: number
  limit: number
}
export type TopicObservation = {
  uri: string
  authorDid: string
  createdAt: string
  canonicalLabel: string
  aliases: string[]
  keywords: string[]
  entities: string[]
  language?: string
  regions: string[]
  confidence: number
  metrics: Partial<Record<Signal, number>>
  source: string
}
export interface TopicClusteringStrategy {
  key(observation: TopicObservation): string
}
/** Sources supply resolved labels/entities. This does not pretend a hashtag alone identifies a topic. */
export const canonicalTopicStrategy: TopicClusteringStrategy = {
  key: o =>
    `${o.language ?? 'und'}:${o.canonicalLabel.normalize('NFKC').trim().toLocaleLowerCase()}`,
}
export function clusterObservations(
  observations: TopicObservation[],
  timeWindow: number,
  now = Date.now(),
  strategy = canonicalTopicStrategy,
): TopicCluster[] {
  if (!Number.isSafeInteger(timeWindow) || timeWindow < 1000)
    throw new Error('Janela inválida')
  const groups = new Map<string, TopicObservation[]>()
  for (const o of observations) {
    const time = Date.parse(o.createdAt)
    if (
      !o.canonicalLabel.trim() ||
      !o.uri.startsWith('at://') ||
      !o.authorDid.startsWith('did:') ||
      !Number.isFinite(time) ||
      time > now ||
      time < now - 2 * timeWindow ||
      !Number.isFinite(o.confidence) ||
      o.confidence < 0 ||
      o.confidence > 1
    )
      continue
    const key = strategy.key(o)
    const records = groups.get(key) ?? []
    // Polling the same post twice never inflates signals or unique-author counts.
    if (!records.some(r => r.uri === o.uri)) records.push(o)
    groups.set(key, records)
  }
  return [...groups.entries()].flatMap(([id, records]) => {
    const recent = records.filter(
      o => Date.parse(o.createdAt) >= now - timeWindow,
    )
    if (!recent.length) return []
    const previous = records.length - recent.length
    const uniqueAuthors = new Set(recent.map(o => o.authorDid)).size
    const velocity = recent.length / (timeWindow / 60000)
    const metrics: Partial<Record<Signal, number>> = {
      postVolume: recent.length,
      uniqueAuthors,
      velocity,
      acceleration: velocity - previous / (timeWindow / 60000),
    }
    for (const signal of [
      'likes',
      'replies',
      'reposts',
      'saves',
      'clicks',
      'videoViews',
      'watchTime',
      'liveViewers',
      'communityActivity',
      'creatorGrowth',
    ] as const) {
      const values = recent.flatMap(o =>
        typeof o.metrics[signal] === 'number' &&
        Number.isFinite(o.metrics[signal]) &&
        o.metrics[signal]! >= 0
          ? [o.metrics[signal]!]
          : [],
      )
      if (values.length === recent.length)
        metrics[signal] = values.reduce((sum, n) => sum + n, 0)
    }
    for (const signal of [
      'trust',
      'spam',
      'duplicates',
      'proximity',
    ] as const) {
      const values = recent.flatMap(o =>
        typeof o.metrics[signal] === 'number' &&
        Number.isFinite(o.metrics[signal])
          ? [Math.min(1, Math.max(0, o.metrics[signal]!))]
          : [],
      )
      if (values.length === recent.length)
        metrics[signal] = values.reduce((sum, n) => sum + n, 0) / values.length
    }
    const first = recent[0]!
    const times = records.map(o => Date.parse(o.createdAt))
    return [
      {
        id,
        canonicalLabel: first.canonicalLabel,
        aliases: [...new Set(recent.flatMap(o => o.aliases))],
        keywords: [...new Set(recent.flatMap(o => o.keywords))],
        entities: [...new Set(recent.flatMap(o => o.entities))],
        language: first.language,
        regions: [...new Set(recent.flatMap(o => o.regions))],
        firstSeenAt: new Date(Math.min(...times)).toISOString(),
        lastSeenAt: new Date(Math.max(...times)).toISOString(),
        postCount: recent.length,
        uniqueAuthors,
        velocity,
        engagementVelocity:
          metrics.likes === undefined
            ? undefined
            : metrics.likes / (timeWindow / 60000),
        confidence: Math.min(...recent.map(o => o.confidence)),
        metrics,
        source: [...new Set(recent.map(o => o.source))].join('; '),
        href: `/topic/${encodeURIComponent(first.canonicalLabel)}`,
      },
    ]
  })
}
const definitions: [string, string, Signal[]][] = [
  ['trending', 'Trending', ['velocity', 'uniqueAuthors', 'likes']],
  ['rising', 'Rising', ['acceleration', 'uniqueAuthors']],
  ['news', 'News', ['velocity', 'trust']],
  ['creators', 'Creators', ['creatorGrowth']],
  ['videos', 'Videos', ['videoViews']],
  ['drops', 'Drops', ['videoViews']],
  ['books', 'Books', ['saves']],
  ['music', 'Music', ['watchTime']],
  ['games', 'Games', ['clicks']],
  ['communities', 'Communities', ['communityActivity']],
  ['live', 'Live', ['liveViewers']],
  ['discussed', 'Most Discussed', ['replies']],
  ['shared', 'Most Shared', ['reposts']],
  ['saved', 'Most Saved', ['saves']],
  ['watched', 'Most Watched', ['watchTime']],
  ['circles', 'In Your Circles', ['proximity']],
  ['local', 'Local', ['velocity']],
  ['global', 'Global', ['velocity']],
]
export const CHARTS: ChartDefinition[] = definitions.map(
  ([id, title, signals]) => ({
    id,
    title,
    description:
      'Ranking de sinais observados; métricas ausentes não são estimadas.',
    scope: id,
    signals,
    weights: Object.fromEntries(signals.map(s => [s, 1])),
    filters: {minAuthors: 3, minConfidence: 0.5},
    timeWindow: 3600000,
    limit: 20,
  }),
)
export function rankTopics(
  clusters: TopicCluster[],
  definition: ChartDefinition,
  now = Date.now(),
) {
  return clusters
    .filter(
      c =>
        Date.parse(c.lastSeenAt) >= now - definition.timeWindow &&
        Date.parse(c.lastSeenAt) <= now &&
        c.uniqueAuthors >= definition.filters.minAuthors &&
        c.confidence >= definition.filters.minConfidence &&
        definition.signals.every(s => Number.isFinite(c.metrics[s])),
    )
    .map(cluster => {
      const diversity = Math.min(
        1,
        cluster.uniqueAuthors / Math.max(1, cluster.postCount),
      )
      const penalty =
        Math.max(0, 1 - Math.min(1, Math.max(0, cluster.metrics.spam ?? 0))) *
        Math.max(
          0,
          1 - Math.min(1, Math.max(0, cluster.metrics.duplicates ?? 0)),
        )
      const terms = definition.signals.map(signal => ({
        signal,
        value: Math.min(10000, Math.max(0, cluster.metrics[signal]!)),
        weight: definition.weights[signal] ?? 0,
      }))
      const score =
        terms.reduce((n, t) => n + Math.log1p(t.value) * t.weight, 0) *
        diversity *
        penalty
      return {
        cluster,
        score,
        explanation: {
          source: cluster.source,
          uniqueAuthors: cluster.uniqueAuthors,
          terms,
          diversity,
          penalty,
        },
      }
    })
    .filter(c => c.score > 0)
    .sort(
      (x, y) => y.score - x.score || x.cluster.id.localeCompare(y.cluster.id),
    )
    .slice(0, definition.limit)
}
