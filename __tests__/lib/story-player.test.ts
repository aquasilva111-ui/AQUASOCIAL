import {
  firstUnseenIndex,
  HOLD_MS,
  newTimer,
  orderGroups,
  pauseTimer,
  playedMs,
  progressOf,
  pruneSeen,
  remainingMs,
  resolveTap,
  ringState,
  SEEN_LIMIT,
  SEEN_TTL_MS,
  startTimer,
  stepPosition,
  storyReplyText,
} from '#/lib/stories/player'

describe('timer', () => {
  it('pausing keeps the played time and resuming continues from it', () => {
    let t = startTimer(newTimer(5000), 1000)
    t = pauseTimer(t, 3000)
    expect(playedMs(t, 99999)).toBe(2000)
    expect(remainingMs(t, 99999)).toBe(3000)
    t = startTimer(t, 10_000)
    expect(remainingMs(t, 11_000)).toBe(2000)
    expect(progressOf(t, 11_000)).toBeCloseTo(0.6)
  })

  it('never exceeds the duration and ignores double start/pause', () => {
    let t = startTimer(newTimer(1000), 0)
    expect(startTimer(t, 500)).toBe(t)
    expect(playedMs(t, 5000)).toBe(1000)
    t = pauseTimer(t, 200)
    expect(pauseTimer(t, 900)).toBe(t)
  })
})

describe('tap vs hold', () => {
  it('splits the screen and ignores holds', () => {
    expect(resolveTap(10, 400, 50)).toBe('prev')
    expect(resolveTap(300, 400, 50)).toBe('next')
    expect(resolveTap(300, 400, HOLD_MS)).toBe('none')
    expect(resolveTap(10, 0, 0)).toBe('none')
  })
})

describe('stepPosition', () => {
  const sizes = [2, 0, 3]
  it('advances within a group, then to the next non-empty group', () => {
    expect(stepPosition(sizes, {group: 0, index: 0}, 1)).toEqual({
      group: 0,
      index: 1,
    })
    expect(stepPosition(sizes, {group: 0, index: 1}, 1)).toEqual({
      group: 2,
      index: 0,
    })
    expect(stepPosition(sizes, {group: 2, index: 2}, 1)).toBe('close')
  })
  it('goes back to the previous group last story, and stays at the start', () => {
    expect(stepPosition(sizes, {group: 2, index: 0}, -1)).toEqual({
      group: 0,
      index: 1,
    })
    const start = {group: 0, index: 0}
    expect(stepPosition(sizes, start, -1)).toBe(start)
  })
})

describe('seen helpers', () => {
  const seen = new Set(['a', 'b'])
  const isSeen = (u: string) => seen.has(u)
  it('starts at the first unseen story, or the first when all are seen', () => {
    expect(firstUnseenIndex(['a', 'b', 'c'], isSeen)).toBe(2)
    expect(firstUnseenIndex(['a', 'b'], isSeen)).toBe(0)
  })
  it('summarises the ring', () => {
    expect(ringState(['a', 'c'], isSeen)).toEqual({
      total: 2,
      unseen: 1,
      allSeen: false,
    })
    expect(ringState(['a'], isSeen).allSeen).toBe(true)
    expect(ringState([], isSeen).allSeen).toBe(false)
  })
  it('orders unseen first, newest first, and drops empty groups', () => {
    const g = (id: string, uris: string[], latestAt: string) => ({
      id,
      uris,
      latestAt,
    })
    const out = orderGroups(
      [
        g('seen', ['a'], '2026-01-03'),
        g('old', ['x'], '2026-01-01'),
        g('new', ['y'], '2026-01-02'),
        g('empty', [], '2026-01-09'),
      ],
      isSeen,
    )
    expect(out.map(x => x.id)).toEqual(['new', 'old', 'seen'])
  })
  it('prunes expired and excess seen entries', () => {
    const now = 10 * SEEN_TTL_MS
    const out = pruneSeen(
      {
        fresh: now - 1000,
        stale: now - SEEN_TTL_MS - 1,
        bad: 'x' as unknown as number,
      },
      now,
    )
    expect(Object.keys(out)).toEqual(['fresh'])
    const many: Record<string, number> = {}
    for (let i = 0; i < SEEN_LIMIT + 20; i++) many[`u${i}`] = now - i
    expect(Object.keys(pruneSeen(many, now))).toHaveLength(SEEN_LIMIT)
  })
})

describe('storyReplyText', () => {
  it('builds reply/reaction text and rejects empty input', () => {
    expect(storyReplyText('reaction', '🔥')).toBe('Reagiu ao seu story: 🔥')
    expect(storyReplyText('reply', '  oi  ')).toBe('Respondeu ao seu story: oi')
    expect(storyReplyText('reply', '   ')).toBeUndefined()
    expect(storyReplyText('reply', 'x'.repeat(500))!.length).toBeLessThan(340)
  })
})
