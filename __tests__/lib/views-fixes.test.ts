import {filledFrames, VIEWS_FRAMES} from '#/lib/media/viewsFrames'
import {
  channelPageState,
  implicitChannel,
  newChannelRecord,
} from '#/lib/view-channel/model'
import {usableDuration} from '#/lib/view-watch/chapters'

const {staticPath} = require('../../server.js')

describe('server.js staticPath (chunks under nested routes)', () => {
  it('maps /views/static/… back to /static/…', () => {
    expect(staticPath('/views/static/js/main.3e168e09.js')).toBe(
      '/static/js/main.3e168e09.js',
    )
    expect(staticPath('/views/channel/x/static/css/a.css')).toBe(
      '/static/css/a.css',
    )
  })
  it('leaves top-level and non-static paths alone', () => {
    expect(staticPath('/static/js/main.js')).toBe('/static/js/main.js')
    expect(staticPath('/views/history')).toBe('/views/history')
    expect(staticPath('/index.html')).toBe('/index.html')
  })
})

describe('webpack publicPath', () => {
  it('is absolute (not "auto") for production builds', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../webpack.config.js'),
      'utf8',
    )
    expect(src).not.toMatch(/publicPath\s*=\s*'auto'/)
    expect(src).toMatch(/WEB_PUBLIC_PATH \|\| '\/'/)
  })
})

describe('filledFrames', () => {
  it('drops frames without an image (no gray placeholders)', () => {
    expect(
      filledFrames(VIEWS_FRAMES.map(f => ({...f, image: undefined}))),
    ).toEqual([])
    const withImg = {...VIEWS_FRAMES[0], image: 'https://x/y.jpg'}
    expect(filledFrames([withImg, VIEWS_FRAMES[1]])).toEqual([withImg])
  })
})

describe('usableDuration', () => {
  it('accepts finite positive numbers only', () => {
    expect(usableDuration(12.5)).toBe(12.5)
    expect(usableDuration(NaN)).toBeUndefined()
    expect(usableDuration(Infinity)).toBeUndefined()
    expect(usableDuration(0)).toBeUndefined()
    expect(usableDuration(undefined)).toBeUndefined()
  })
})

describe('channelPageState', () => {
  const base = {
    channel: undefined,
    isOwner: false,
    moderated: false,
    videoCount: 0,
    videosLoading: false,
  }
  it('gives a creator with videos but no record an implicit channel', () => {
    const s = channelPageState({...base, videoCount: 3})
    expect(s.state).toBe('visible')
    if (s.state === 'visible') {
      expect(s.implicit).toBe(true)
      expect(s.channel.visibility).toBe('public')
      expect(s.channel.status).toBe('active')
    }
  })
  it('waits while videos load, then falls back to none', () => {
    expect(channelPageState({...base, videosLoading: true}).state).toBe(
      'loading',
    )
    expect(channelPageState(base).state).toBe('none')
  })
  it('uses the real record when there is one', () => {
    const channel = newChannelRecord({}, new Date())
    const s = channelPageState({...base, channel})
    expect(s).toEqual({state: 'visible', channel, implicit: false})
  })
  it('keeps moderation ahead of the implicit channel', () => {
    expect(
      channelPageState({...base, moderated: true, videoCount: 5}).state,
    ).toBe('suspended')
  })
  it('implicitChannel is a public active default', () => {
    expect(implicitChannel().sections.length).toBeGreaterThan(0)
  })
})
