import {describe, expect, it} from '@jest/globals'

import {
  aquaPostUrl,
  assistProgress,
  assistSubtitle,
  assistTransition,
  mediaNotice,
  prepareAssist,
} from '../../src/lib/launch-hub/assist'
import {
  DESTINATIONS,
  effectiveMode,
  getDestination,
  normalizeInstance,
  qs,
} from '../../src/lib/launch-hub/destinations'
import {
  adaptPost,
  measure,
  normalizeHashtag,
  type TextRules,
  truncateTo,
  X_URL_LENGTH,
} from '../../src/lib/launch-hub/formatting'
import {deriveLaunchStatus} from '../../src/lib/launch-hub/status'
import {
  type Launch,
  type LaunchDestination,
} from '../../src/lib/launch-hub/types'

const rulesOf = (id: Parameters<typeof getDestination>[0]) =>
  getDestination(id).capabilities.text
const params = (url: string) => new URL(url).searchParams
const post = (
  text: string,
  extra: Partial<Parameters<typeof prepareAssist>[0]['contentPackage']> = {},
) => ({
  contentPackage: {text, media: [], ...extra},
})

describe('registry', () => {
  it('every assisted network has a builder and a verification mark', () => {
    for (const d of DESTINATIONS) {
      if (d.mode === 'assistido') {
        expect(d.assist).toBeDefined()
        expect(['oficial', 'pratica', 'nao-verificado']).toContain(
          d.assist!.verified,
        )
      }
    }
  })

  it('Aqua/Bluesky stay auto; integration networks flip to auto when the API is configured', () => {
    expect(effectiveMode(getDestination('aqua'), false)).toBe('auto')
    expect(effectiveMode(getDestination('bluesky'), false)).toBe('auto')
    expect(effectiveMode(getDestination('x'), false)).toBe('assistido')
    expect(effectiveMode(getDestination('x'), true)).toBe('auto')
    expect(effectiveMode(getDestination('linkedin'), true)).toBe('auto')
    // no API at all: stays assisted
    expect(effectiveMode(getDestination('wattpad'), true)).toBe('assistido')
    expect(effectiveMode(getDestination('reddit'), true)).toBe('assistido')
    // no assist and no integration
    expect(effectiveMode(getDestination('website'), false)).toBe('indisponivel')
  })

  it('qs encodes with %20/%23 and skips empty values', () => {
    expect(qs({text: 'a b #c & d', url: undefined, x: ''})).toBe(
      '?text=a%20b%20%23c%20%26%20d',
    )
    expect(qs({})).toBe('')
  })
})

describe('URL builders', () => {
  const p = {
    text: 'Olá, mundo! #arte & ação',
    url: 'https://aqua.app/p/1?a=b&c=d',
    hashtags: ['arte'],
  }

  it('X: x.com/intent/post with text + url', () => {
    const u = getDestination('x').assist!.buildUrl(p)!
    expect(u.startsWith('https://x.com/intent/post?')).toBe(true)
    expect(params(u).get('text')).toBe(p.text)
    expect(params(u).get('url')).toBe(p.url)
    expect(u).not.toContain('#') // hash encoded, never a fragment
  })

  it('Threads: threads.com/intent/post with text, url and one topic tag', () => {
    const u = getDestination('threads').assist!.buildUrl({
      ...p,
      hashtags: ['arte.digital'],
    })!
    expect(u.startsWith('https://www.threads.com/intent/post?')).toBe(true)
    expect(params(u).get('text')).toBe(p.text)
    expect(params(u).get('url')).toBe(p.url)
    expect(params(u).get('tag')).toBe('artedigital')
  })

  it('LinkedIn: share-offsite only takes url', () => {
    const u = getDestination('linkedin').assist!.buildUrl(p)!
    expect(u).toBe(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(p.url)}`,
    )
    expect(
      getDestination('linkedin').assist!.buildUrl({...p, url: undefined}),
    ).toBe('https://www.linkedin.com/feed/')
  })

  it('Facebook: sharer.php?u=', () => {
    expect(getDestination('facebook').assist!.buildUrl(p)).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(p.url)}`,
    )
  })

  it('Reddit: submit?url&title&type=LINK, or a text title without link', () => {
    const u = getDestination('reddit').assist!.buildUrl({
      ...p,
      title: 'Meu título',
    })!
    expect(params(u).get('url')).toBe(p.url)
    expect(params(u).get('title')).toBe('Meu título')
    expect(params(u).get('type')).toBe('LINK')
    const t = getDestination('reddit').assist!.buildUrl({...p, url: undefined})!
    expect(params(t).get('type')).toBeNull()
    expect(params(t).get('title')).toBe(p.text)
  })

  it('Pinterest: pin/create/button with url, media, description', () => {
    const u = getDestination('pinterest').assist!.buildUrl({
      ...p,
      mediaUrl: 'https://cdn/x.jpg',
    })!
    expect(u.startsWith('https://www.pinterest.com/pin/create/button/?')).toBe(
      true,
    )
    expect(params(u).get('media')).toBe('https://cdn/x.jpg')
    expect(params(u).get('description')).toBe(p.text)
  })

  it('Tumblr: link post with canonicalUrl, or text post', () => {
    const u = getDestination('tumblr').assist!.buildUrl({...p, title: 'T'})!
    expect(params(u).get('posttype')).toBe('link')
    expect(params(u).get('canonicalUrl')).toBe(p.url)
    expect(params(u).get('caption')).toBe(p.text)
    expect(params(u).get('tags')).toBe('arte')
    const t = getDestination('tumblr').assist!.buildUrl({...p, url: undefined})!
    expect(params(t).get('posttype')).toBe('text')
    expect(params(t).get('content')).toBe(p.text)
  })

  it('Mastodon: needs a server; accepts host, URL or @user@host', () => {
    const b = getDestination('mastodon').assist!.buildUrl
    expect(b(p)).toBeUndefined()
    expect(b(p, {instance: 'not a host'})).toBeUndefined()
    expect(b(p, {instance: 'https://Mastodon.Social/@x'})).toBe(
      `https://mastodon.social/share?text=${encodeURIComponent(p.text)}`,
    )
    expect(normalizeInstance('@samu@hachyderm.io')).toBe('hachyderm.io')
  })

  it('WhatsApp/Telegram', () => {
    const wa = getDestination('whatsapp').assist!.buildUrl(p)!
    expect(wa.startsWith('https://wa.me/?text=')).toBe(true)
    expect(params(wa).get('text')).toBe(`${p.text}\n\n${p.url}`)
    const tg = getDestination('telegram').assist!.buildUrl(p)!
    expect(params(tg).get('url')).toBe(p.url)
    expect(
      getDestination('telegram').assist!.buildUrl({...p, url: undefined}),
    ).toBeUndefined()
  })

  it('Wattpad/BandLab: open the create page (text goes by clipboard)', () => {
    expect(getDestination('wattpad').assist!.kind).toBe('abrir-e-colar')
    expect(getDestination('wattpad').assist!.buildUrl(p)).toBe(
      'https://www.wattpad.com/myworks/new',
    )
    expect(getDestination('bandlab').assist!.buildUrl(p)).toBe(
      'https://www.bandlab.com/',
    )
  })
})

describe('counting', () => {
  it('X counts links as 23, CJK as 2, an emoji sequence as 2', () => {
    expect(
      measure('https://example.com/a/very/long/path?with=query', 'x'),
    ).toBe(X_URL_LENGTH)
    expect(measure('olá', 'x')).toBe(3)
    expect(measure('日本', 'x')).toBe(4)
    expect(measure('👍', 'x')).toBe(2)
    expect(measure('👍🏽', 'x')).toBe(2)
    expect(measure('👨‍👩‍👧', 'x')).toBe(2)
    expect(measure('🇧🇷', 'x')).toBe(2)
  })

  it('code points elsewhere', () => {
    expect(measure('açaí 👍', 'codepoints')).toBe(6)
  })

  it('normalizes hashtags', () => {
    expect(normalizeHashtag('#Arte Digital!')).toBe('ArteDigital')
    expect(normalizeHashtag('##ação')).toBe('ação')
  })

  it('truncates at a word boundary with an ellipsis', () => {
    const out = truncateTo('um dois três quatro cinco', 14, 'codepoints')
    expect(out).toBe('um dois três…')
    expect(measure(out, 'codepoints')).toBeLessThanOrEqual(14)
  })
})

describe('adaptPost', () => {
  const long = 'palavra '.repeat(100).trim() // 799 chars

  it('X: fits 280 counting the link as 23, keeps the link param', () => {
    const r = adaptPost(
      {
        text: long,
        link: 'https://exemplo.com/' + 'x'.repeat(200),
        tags: ['aqua'],
      },
      rulesOf('x'),
    )
    expect(r.length).toBeLessThanOrEqual(280)
    expect(r.url).toContain('exemplo.com')
    expect(r.text).not.toContain('exemplo.com')
    expect(r.truncated).toBe(true)
    expect(r.text.endsWith('#aqua')).toBe(true)
    expect(measure(r.text, 'x') + 1 + X_URL_LENGTH).toBe(r.length)
  })

  it('Threads: 500 limit', () => {
    const r = adaptPost({text: long}, rulesOf('threads'))
    expect(r.length).toBeLessThanOrEqual(500)
    expect(r.text.endsWith('…')).toBe(true)
  })

  it('short text is untouched; hashtags appended once', () => {
    const r = adaptPost(
      {
        text: 'Novo single! #musica',
        tags: ['música', 'musica', 'Indie', '2026'],
      },
      rulesOf('mastodon'),
    )
    expect(r.truncated).toBe(false)
    expect(r.text).toBe('Novo single! #musica\n\n#música #Indie')
  })

  it('drops hashtags before cutting the text', () => {
    const rules: TextRules = {
      maxLength: 30,
      counting: 'codepoints',
      linkParam: false,
      linkCountsInLimit: false,
      hashtags: true,
    }
    const r = adaptPost(
      {text: 'texto de vinte e sete chars', tags: ['a', 'bb']},
      rules,
    )
    expect(r.truncated).toBe(false)
    expect(r.droppedHashtags).toEqual(['a', 'bb'])
    expect(r.text).toBe('texto de vinte e sete chars')
  })

  it('adds the link back to the Aqua post; both links when there is an external one', () => {
    const r1 = adaptPost(
      {text: 'Oi', aquaUrl: 'https://aqua.app/p/1'},
      rulesOf('mastodon'),
    )
    expect(r1.text).toBe('Oi\n\nhttps://aqua.app/p/1')
    const r2 = adaptPost(
      {text: 'Oi', link: 'https://loja.com', aquaUrl: 'https://aqua.app/p/1'},
      rulesOf('x'),
    )
    expect(r2.url).toBe('https://loja.com')
    expect(r2.text).toBe('Oi\n\nTambém na Aqua: https://aqua.app/p/1')
    expect(r2.length).toBe(2 + 2 + 'Também na Aqua: '.length + 23 + 1 + 23)
  })

  it('Instagram: no links in the caption', () => {
    const r = adaptPost(
      {text: 'Oi', link: 'https://loja.com', aquaUrl: 'https://aqua.app/p/1'},
      rulesOf('instagram'),
    )
    expect(r.text).toBe('Oi')
  })

  it('never exceeds the limit, even with huge links and tags', () => {
    for (const d of DESTINATIONS) {
      const r = adaptPost(
        {
          text: '日本語 😀 '.repeat(2000),
          link: 'https://a.com/' + 'x'.repeat(50),
          aquaUrl: 'https://aqua.app/p/2',
          tags: ['um', 'dois', 'três'],
        },
        d.capabilities.text,
      )
      expect(r.length).toBeLessThanOrEqual(r.limit)
    }
  })
})

describe('prepareAssist', () => {
  it('X intent prefilled; copy text is the adapted text', () => {
    const p = prepareAssist(
      post('Lançamento hoje', {link: 'https://loja.com', tags: ['aqua']}),
      {provider: 'x'},
    )
    expect(params(p.openUrl!).get('text')).toBe('Lançamento hoje\n\n#aqua')
    expect(params(p.openUrl!).get('url')).toBe('https://loja.com')
    expect(p.copyText).toBe('Lançamento hoje\n\n#aqua')
  })

  it('LinkedIn: link goes in the share URL, the text by clipboard', () => {
    const p = prepareAssist(
      post('Oi', {link: 'https://loja.com'}),
      {provider: 'linkedin'},
      {aquaUrl: 'https://aqua.app/p/1'},
    )
    expect(params(p.openUrl!).get('url')).toBe('https://loja.com')
    expect(p.copyText).toBe('Oi\n\nTambém na Aqua: https://aqua.app/p/1')
  })

  it('Wattpad (abrir-e-colar): the link is part of what gets copied', () => {
    const p = prepareAssist(post('Capítulo 1', {link: 'https://loja.com'}), {
      provider: 'wattpad',
    })
    expect(p.copyText).toBe('Capítulo 1\n\nhttps://loja.com')
    expect(p.openUrl).toBe('https://www.wattpad.com/myworks/new')
  })

  it('custom caption per destination wins; Mastodon without server is flagged', () => {
    const p = prepareAssist(post('geral'), {
      provider: 'mastodon',
      customCaption: 'só pro fedi',
    })
    expect(p.adapted.text).toBe('só pro fedi')
    expect(p.openUrl).toBeUndefined()
    expect(p.missing).toMatch(/servidor/)
  })

  it('Aqua post URL from the published Aqua destination', () => {
    const launch = {
      destinations: [
        {
          provider: 'aqua',
          status: 'published',
          remoteUrl: '/profile/samu.aqua/post/3k',
        },
      ],
    } as unknown as Launch
    expect(aquaPostUrl(launch, 'https://aqua.app')).toBe(
      'https://aqua.app/profile/samu.aqua/post/3k',
    )
  })
})

describe('status', () => {
  it('assisted transitions', () => {
    expect(assistTransition('pending', 'abrir')).toBe('opened')
    expect(assistTransition('published', 'abrir')).toBe('published')
    expect(assistTransition('opened', 'publicado')).toBe('published')
    expect(assistTransition('opened', 'erro')).toBe('failed')
    expect(assistTransition('published', 'reabrir')).toBe('pending')
  })

  it('launch waits for the person while assisted ones are open', () => {
    expect(
      deriveLaunchStatus([
        {status: 'published', mode: 'auto'},
        {status: 'opened', mode: 'assistido'},
        {status: 'pending', mode: 'assistido'},
      ]),
    ).toBe('awaiting_user')
    expect(
      deriveLaunchStatus(
        [
          {status: 'pending', mode: 'auto'},
          {status: 'pending', mode: 'assistido'},
        ],
        'publishing',
      ),
    ).toBe('publishing')
    expect(
      deriveLaunchStatus([
        {status: 'published', mode: 'auto'},
        {status: 'published', mode: 'assistido'},
        {status: 'skipped', mode: 'assistido'},
      ]),
    ).toBe('published')
    expect(
      deriveLaunchStatus([
        {status: 'published', mode: 'auto'},
        {status: 'failed', mode: 'assistido'},
      ]),
    ).toBe('partial')
  })
})

describe('Publicar em todas (mockup)', () => {
  it('card subtitles say how each network receives the post', () => {
    expect(assistSubtitle(getDestination('x'))).toBe('texto e link')
    expect(assistSubtitle(getDestination('threads'))).toBe('texto e link')
    expect(assistSubtitle(getDestination('linkedin'))).toBe(
      'link de compartilhar',
    )
    expect(assistSubtitle(getDestination('facebook'))).toBe(
      'link de compartilhar',
    )
    expect(assistSubtitle(getDestination('instagram'))).toBe(
      'pelo compartilhar do celular',
    )
    expect(assistSubtitle(getDestination('pinterest'))).toBe(
      'link de criar pin',
    )
    expect(assistSubtitle(getDestination('wattpad'))).toBe('copiar e abrir')
    expect(assistSubtitle(getDestination('reddit'))).toBe('título e link')
  })

  it('media notice: X/Threads text+link only, Instagram via share sheet', () => {
    const n = mediaNotice(
      ['x', 'threads', 'instagram'].map(id => getDestination(id as 'x')),
    )!
    expect(n).toContain(
      'No X e no Threads o link de postar leva só texto e link',
    )
    expect(n).toContain('Instagram vai pelo compartilhar do celular')
    expect(
      mediaNotice([getDestination('wattpad'), getDestination('reddit')]),
    ).toBeUndefined()
  })

  it('dock progress counts every destination and picks the next pending one', () => {
    const d = (
      provider: string,
      status: LaunchDestination['status'],
      mode: 'auto' | 'assistido',
    ) => ({id: provider, provider, status, mode}) as LaunchDestination
    const p = assistProgress([
      d('aqua', 'published', 'auto'),
      d('bluesky', 'published', 'auto'),
      d('linkedin', 'published', 'assistido'),
      d('facebook', 'published', 'assistido'),
      d('x', 'opened', 'assistido'),
      d('threads', 'pending', 'assistido'),
      d('instagram', 'pending', 'assistido'),
      d('pinterest', 'failed', 'assistido'),
    ])
    expect(p.done).toBe(4)
    expect(p.total).toBe(8)
    expect(p.assistedDone).toBe(2)
    expect(p.assistedTotal).toBe(6)
    expect(p.next?.provider).toBe('threads')
    const only = assistProgress([d('x', 'opened', 'assistido')])
    expect(only.next?.provider).toBe('x')
    expect(
      assistProgress([d('x', 'skipped', 'assistido')]).next,
    ).toBeUndefined()
  })
})
