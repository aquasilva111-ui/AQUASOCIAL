import {
  addToQueue,
  clearQueue,
  closeMiniPlayer,
  getViewPlayback,
  isQueued,
  noteMiniPlayerTime,
  openMiniPlayer,
  peekMiniPlayerTime,
  pickNext,
  removeFromQueue,
  resetViewPlayback,
  setAutoplay,
  takeOverFromMiniPlayer,
  type ViewVideoRef,
} from '#/state/view-playback'

const v = (id: string): ViewVideoRef => ({
  uri: `at://did:plc:a/app.bsky.feed.post/${id}`,
  did: 'did:plc:a',
  rkey: id,
  title: `Vídeo ${id}`,
  author: 'A',
})

beforeEach(() => resetViewPlayback())

describe('queue', () => {
  it('adds once, removes and clears', () => {
    addToQueue(v('1'))
    addToQueue(v('1'))
    addToQueue(v('2'))
    expect(getViewPlayback().queue.map(x => x.rkey)).toEqual(['1', '2'])
    expect(isQueued(v('2').uri)).toBe(true)
    removeFromQueue(v('1').uri)
    expect(getViewPlayback().queue.map(x => x.rkey)).toEqual(['2'])
    clearQueue()
    expect(getViewPlayback().queue).toEqual([])
  })
})

describe('what plays next', () => {
  it('queue first, skipping the video playing now', () => {
    const next = pickNext([v('cur'), v('q1')], v('cur').uri, [v('r1')])
    expect(next).toEqual({video: v('q1'), fromQueue: true})
  })
  it('then the first recommendation', () => {
    expect(pickNext([], v('cur').uri, [v('cur'), v('r1')])).toEqual({
      video: v('r1'),
      fromQueue: false,
    })
  })
  it('nothing when there is nothing', () => {
    expect(pickNext([], v('cur').uri, [])).toBeUndefined()
  })
})

describe('autoplay preference', () => {
  it('is on by default and can be switched off', () => {
    expect(getViewPlayback().autoplay).toBe(true)
    setAutoplay(false)
    expect(getViewPlayback().autoplay).toBe(false)
  })
})

describe('miniplayer', () => {
  const mini = {...v('m'), playlist: 'https://video/m.m3u8', time: 12}

  it('keeps the position and hands it back to the same video', () => {
    openMiniPlayer(mini)
    noteMiniPlayerTime(mini.uri, 42)
    expect(peekMiniPlayerTime(mini.uri)).toBe(42)
    expect(peekMiniPlayerTime(v('other').uri)).toBeUndefined()
    expect(takeOverFromMiniPlayer(mini.uri)).toBe(42)
    expect(getViewPlayback().mini).toBeNull()
  })

  it('another watch page closes it without resuming', () => {
    openMiniPlayer(mini)
    expect(takeOverFromMiniPlayer(v('other').uri)).toBeUndefined()
    expect(getViewPlayback().mini).toBeNull()
  })

  it('can be closed', () => {
    openMiniPlayer(mini)
    closeMiniPlayer()
    expect(getViewPlayback().mini).toBeNull()
  })
})
