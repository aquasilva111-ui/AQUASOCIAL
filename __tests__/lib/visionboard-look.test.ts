import {normalizeBoard} from '#/lib/visionboard/boards'
import {
  DEFAULT_LOOK,
  musicEmbed,
  normalizeFont,
  normalizeFrame,
  normalizeLayout,
  normalizeTheme,
  resolveLook,
} from '#/lib/visionboard/look'

describe('musicEmbed', () => {
  it('maps the three supported hosts to embed URLs', () => {
    expect(
      musicEmbed('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'),
    ).toEqual({
      provider: 'spotify',
      url: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
      height: 152,
    })
    expect(musicEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.url).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    )
    expect(musicEmbed('youtu.be/dQw4w9WgXcQ')?.provider).toBe('youtube')
    expect(musicEmbed('https://soundcloud.com/artist/track')?.provider).toBe(
      'soundcloud',
    )
  })

  it('rejects any other host, scheme or malformed value', () => {
    expect(musicEmbed('https://evil.example/embed/x')).toBeUndefined()
    expect(musicEmbed('javascript:alert(1)')).toBeUndefined()
    expect(musicEmbed('https://open.spotify.com/evil/abc')).toBeUndefined()
    expect(musicEmbed('https://www.youtube.com/watch?v=short')).toBeUndefined()
    expect(musicEmbed('')).toBeUndefined()
    expect(musicEmbed(42)).toBeUndefined()
  })
})

describe('look normalizers', () => {
  it('only accept known values', () => {
    expect(normalizeTheme('night')).toBe('night')
    expect(normalizeTheme('__proto__')).toBeUndefined()
    expect(normalizeTheme('toString')).toBeUndefined()
    expect(normalizeFont('serif')).toBe('serif')
    expect(normalizeFont('comic')).toBeUndefined()
    expect(normalizeFrame('clean')).toBe('clean')
    expect(normalizeFrame('x')).toBeUndefined()
    expect(normalizeLayout('grid')).toBe('grid')
    expect(normalizeLayout(1)).toBeUndefined()
    expect(DEFAULT_LOOK.theme).toBe('paper')
  })

  it('are applied when reading a board record', () => {
    const b = normalizeBoard({
      title: 'Verão',
      theme: 'sky',
      font: 'hand',
      frame: 'clean',
      layout: 'grid',
      music: 'https://open.spotify.com/track/abc123',
    })
    expect(b).toMatchObject({
      theme: 'sky',
      font: 'hand',
      frame: 'clean',
      layout: 'grid',
      music: 'https://open.spotify.com/track/abc123',
    })
  })

  it('drops invalid look fields and unsafe music from a foreign client', () => {
    const b = normalizeBoard({
      title: 'X',
      theme: 'neon',
      font: 5,
      music: 'https://evil.example/x',
    })
    expect(b?.theme).toBeUndefined()
    expect(b?.font).toBeUndefined()
    expect(b?.music).toBeUndefined()
  })
})

describe('resolveLook', () => {
  it('fills defaults and resolves colours and font family', () => {
    expect(resolveLook({})).toMatchObject({
      bg: '#F1E7D8',
      fg: '#2B2118',
      frame: 'polaroid',
      layout: 'mural',
      fontFamily: undefined,
    })
    expect(
      resolveLook({theme: 'night', font: 'serif', frame: 'clean'}),
    ).toMatchObject({
      bg: '#1A1712',
      frame: 'clean',
      fontFamily: "Georgia, 'Times New Roman', serif",
    })
  })
})
