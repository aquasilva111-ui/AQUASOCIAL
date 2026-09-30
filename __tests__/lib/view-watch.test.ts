import {
  chapterAt,
  formatTime,
  parseChapters,
  parseStartParam,
  parseTimestamp,
  splitTitle,
} from '#/lib/view-watch/chapters'
import {router} from '#/routes'

describe('chapters from the video text', () => {
  const text = [
    'Trilha até a cachoeira',
    'Sábado de trilha com a galera.',
    '0:00 Saída',
    '0:48 - A subida',
    '• 5:40 Parada no mirante',
    '(10:12) A cachoeira',
  ].join('\n')

  it('reads timestamp lines in order', () => {
    expect(parseChapters(text)).toEqual([
      {startSec: 0, title: 'Saída'},
      {startSec: 48, title: 'A subida'},
      {startSec: 340, title: 'Parada no mirante'},
      {startSec: 612, title: 'A cachoeira'},
    ])
  })

  it('needs a real list: from 0:00, 2+ entries, increasing, inside the video', () => {
    expect(parseChapters('0:48 A subida\n1:00 Fim')).toEqual([])
    expect(parseChapters('0:00 Só um')).toEqual([])
    expect(parseChapters('0:00 A\n2:00 B\n1:00 C')).toEqual([])
    expect(parseChapters('0:00 A\n20:00 B', 600)).toEqual([])
    expect(parseChapters('0:00 A\n1:00:00 B', 7200)).toHaveLength(2)
  })

  it('finds the chapter playing now', () => {
    const chapters = parseChapters(text)
    expect(chapterAt(chapters, 0)).toBe(0)
    expect(chapterAt(chapters, 50)).toBe(1)
    expect(chapterAt(chapters, 9999)).toBe(3)
    expect(chapterAt([], 10)).toBe(-1)
  })
})

describe('time helpers', () => {
  it('parses and formats timestamps', () => {
    expect(parseTimestamp('12:48')).toBe(768)
    expect(parseTimestamp('1:02:03')).toBe(3723)
    expect(parseTimestamp('1:75')).toBeUndefined()
    expect(formatTime(192)).toBe('3:12')
    expect(formatTime(3723)).toBe('1:02:03')
    expect(formatTime(-4)).toBe('0:00')
  })

  it('reads share-at-time links', () => {
    expect(parseStartParam('192')).toBe(192)
    expect(parseStartParam('192s')).toBe(192)
    expect(parseStartParam('3m12s')).toBe(192)
    expect(parseStartParam('1h2m3s')).toBe(3723)
    for (const bad of ['', 'abc', '3x', undefined, 12])
      expect(parseStartParam(bad)).toBeUndefined()
  })

  it('the watch route keeps its path and accepts ?t=', () => {
    const [name, params] = router.matchPath('/views/watch/did:plc:abc/3kx')
    expect(name).toBe('VideoWatch')
    expect(params).toMatchObject({name: 'did:plc:abc', rkey: '3kx'})
    // Links shared before the /videos → /views move still open the video.
    expect(router.matchPath('/videos/watch/did:plc:abc/3kx')).toEqual([
      'VideoWatchLegacy',
      {name: 'did:plc:abc', rkey: '3kx'},
    ])
  })
})

describe('title and description', () => {
  it('first line is the title, the rest the description', () => {
    expect(splitTitle('Título\nDescrição aqui\nmais')).toEqual({
      title: 'Título',
      description: 'Descrição aqui\nmais',
    })
    expect(splitTitle('')).toEqual({title: '', description: ''})
  })

  it('a very long first line becomes a shortened title and the full description', () => {
    const long = 'palavra '.repeat(30).trim()
    const r = splitTitle(long)
    expect(r.title.endsWith('…')).toBe(true)
    expect(r.title.length).toBeLessThanOrEqual(101)
    expect(r.description).toBe(long)
  })
})
