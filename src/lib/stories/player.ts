/**
 * Pure playback logic for the story viewer (no React, no reanimated), so
 * the parts that were buggy are unit-testable: pause/resume that keeps the
 * remaining time, tap vs hold, and stepping across people's stories.
 * Patterns follow react-native-story-view (Simform, MIT) and
 * deebov/stories (MIT).
 */

export const STORY_DURATION_MS = 5000
/** Holding longer than this pauses; releasing then must not navigate. */
export const HOLD_MS = 200
/** Left share of the screen that means "previous". */
export const PREV_ZONE = 0.3

export type Timer = {
  duration: number
  /** Time already played, excluding the running segment. */
  elapsed: number
  /** When the running segment started; null while paused/not started. */
  startedAt: number | null
}

export function newTimer(duration = STORY_DURATION_MS): Timer {
  return {duration, elapsed: 0, startedAt: null}
}

export function playedMs(t: Timer, now: number): number {
  const running = t.startedAt === null ? 0 : now - t.startedAt
  return Math.min(t.duration, t.elapsed + Math.max(0, running))
}

export function remainingMs(t: Timer, now: number): number {
  return t.duration - playedMs(t, now)
}

export function progressOf(t: Timer, now: number): number {
  return t.duration > 0 ? playedMs(t, now) / t.duration : 1
}

export function startTimer(t: Timer, now: number): Timer {
  return t.startedAt === null ? {...t, startedAt: now} : t
}

/** Pausing keeps what was played, so resuming continues, not restarts. */
export function pauseTimer(t: Timer, now: number): Timer {
  if (t.startedAt === null) return t
  return {...t, elapsed: playedMs(t, now), startedAt: null}
}

export type TapAction = 'prev' | 'next' | 'none'

/** A press is a tap only if it was released before the hold threshold. */
export function resolveTap(
  x: number,
  width: number,
  heldMs: number,
): TapAction {
  if (heldMs >= HOLD_MS || width <= 0) return 'none'
  return x / width < PREV_ZONE ? 'prev' : 'next'
}

export type StoryPos = {group: number; index: number}

export type StepResult = StoryPos | 'close'

/**
 * Moves one story forward/back across groups (people). Past the last story
 * of the last group it closes; before the very first it stays put.
 */
export function stepPosition(
  sizes: number[],
  pos: StoryPos,
  dir: 1 | -1,
): StepResult {
  if (dir === 1) {
    if (pos.index < sizes[pos.group] - 1) {
      return {group: pos.group, index: pos.index + 1}
    }
    for (let g = pos.group + 1; g < sizes.length; g++) {
      if (sizes[g] > 0) return {group: g, index: 0}
    }
    return 'close'
  }
  if (pos.index > 0) return {group: pos.group, index: pos.index - 1}
  for (let g = pos.group - 1; g >= 0; g--) {
    if (sizes[g] > 0) return {group: g, index: sizes[g] - 1}
  }
  return pos
}

/** Where to start a person's stories: the first one not seen yet. */
export function firstUnseenIndex(
  uris: string[],
  isSeen: (uri: string) => boolean,
): number {
  const i = uris.findIndex(u => !isSeen(u))
  return i === -1 ? 0 : i
}

/** Ring state for a person: how many segments, how many are unseen. */
export function ringState(
  uris: string[],
  isSeen: (uri: string) => boolean,
): {total: number; unseen: number; allSeen: boolean} {
  const unseen = uris.filter(u => !isSeen(u)).length
  return {total: uris.length, unseen, allSeen: uris.length > 0 && unseen === 0}
}

/**
 * Orders people for a tray: unseen first (most recent story first), then
 * seen ones, never changing the relative order inside each bucket.
 */
export function orderGroups<T extends {uris: string[]; latestAt: string}>(
  groups: T[],
  isSeen: (uri: string) => boolean,
): T[] {
  const unseen: T[] = []
  const seen: T[] = []
  for (const g of groups) {
    if (!g.uris.length) continue
    ;(ringState(g.uris, isSeen).allSeen ? seen : unseen).push(g)
  }
  const byLatest = (a: T, b: T) => b.latestAt.localeCompare(a.latestAt)
  return [...unseen.sort(byLatest), ...seen.sort(byLatest)]
}

// ------------------------------------------------------------ seen storage

export const SEEN_TTL_MS = 48 * 60 * 60 * 1000
export const SEEN_LIMIT = 500

/** Drops entries older than the story TTL (+margin) and caps the size. */
export function pruneSeen(
  seen: Record<string, number>,
  now: number,
): Record<string, number> {
  const entries = Object.entries(seen)
    .filter(([, at]) => typeof at === 'number' && now - at < SEEN_TTL_MS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SEEN_LIMIT)
  return Object.fromEntries(entries)
}

// ------------------------------------------------------------ replies

export const REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥']
export const REPLY_MAX = 300

/** Text of the DM sent when replying/reacting to someone's story. */
export function storyReplyText(
  kind: 'reply' | 'reaction',
  body: string,
): string | undefined {
  const text = body.trim().slice(0, REPLY_MAX)
  if (!text) return undefined
  return kind === 'reaction'
    ? `Reagiu ao seu story: ${text}`
    : `Respondeu ao seu story: ${text}`
}
