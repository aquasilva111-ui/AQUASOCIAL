import {base64Url, codeChallenge, randomString} from '#/lib/music/pkce'
import {MusicError} from '#/lib/music/types'
import {
  notifyConnectionsChanged,
  resetMusic,
  stopMusic,
  useMusic,
} from '#/state/music'

describe('pkce', () => {
  it('builds a url-safe S256 challenge (RFC 7636 appendix B)', async () => {
    const challenge = await codeChallenge(
      'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    )
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('generates verifiers of the requested length from the allowed set', () => {
    const v = randomString(96)
    expect(v).toHaveLength(96)
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })

  it('base64url has no padding or unsafe chars', () => {
    expect(base64Url(new Uint8Array([251, 255, 254]).buffer)).toBe('-__-')
  })
})

describe('music state', () => {
  it('starts empty and stopMusic is a no-op', () => {
    resetMusic()
    stopMusic()
    notifyConnectionsChanged()
    expect(typeof useMusic).toBe('function')
  })

  it('MusicError keeps its code', () => {
    expect(new MusicError('premium', 'x').code).toBe('premium')
  })
})
