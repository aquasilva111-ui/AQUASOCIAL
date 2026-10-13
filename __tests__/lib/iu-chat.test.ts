import fs from 'node:fs'
import path from 'node:path'

import {normalizeIuChatUrl as normalizeFromApp} from '#/lib/iu-chat'
import {IU_CHAT_ICON_XML} from '#/components/icons/iu-chat-icon-xml'
import {router} from '#/routes'

const {
  DEFAULT_IU_CHAT_URL,
  assessIuChatEmbed,
  decideIuChatView,
  isSameSite,
  normalizeIuChatUrl,
} = require('../../src/lib/iu-chat/embed')

describe('IU Chat route', () => {
  it('resolves /iu-chat and builds that path', () => {
    expect(router.matchPath('/iu-chat')[0]).toBe('IUChat')
    expect(router.build('IUChat', {})).toBe('/iu-chat')
  })
})

describe('IU Chat URL', () => {
  it('defaults to localhost:3080 and strips a trailing slash', () => {
    expect(normalizeIuChatUrl(undefined)).toBe(DEFAULT_IU_CHAT_URL)
    expect(normalizeIuChatUrl('')).toBe('http://localhost:3080')
    expect(normalizeIuChatUrl('http://localhost:3080/')).toBe(
      'http://localhost:3080',
    )
    expect(normalizeFromApp('http://localhost:3080/')).toBe(
      'http://localhost:3080',
    )
  })
})

describe('IU Chat same-site session', () => {
  it('treats different ports on one host as the same site', () => {
    expect(isSameSite('http://localhost:19006', 'http://localhost:3080')).toBe(
      true,
    )
    expect(
      isSameSite('https://aquaapp.systems', 'https://chat.aquaapp.systems'),
    ).toBe(true)
  })

  it('treats localhost and 127.0.0.1, or another domain, as cross-site', () => {
    expect(isSameSite('http://127.0.0.1:19006', 'http://localhost:3080')).toBe(
      false,
    )
    expect(isSameSite('https://aquaapp.systems', 'https://chat.example')).toBe(
      false,
    )
    expect(isSameSite('https://aquaapp.systems', 'http://localhost:3080')).toBe(
      false,
    )
  })
})

describe('IU Chat framing', () => {
  const aqua = 'http://localhost:19006'
  const chat = 'http://localhost:3080'

  it('blocks the default SAMEORIGIN header across ports', () => {
    expect(
      assessIuChatEmbed({
        aquaOrigin: aqua,
        chatUrl: chat,
        xFrameOptions: 'SAMEORIGIN',
        contentSecurityPolicy: null,
      }).frameable,
    ).toBe(false)
  })

  it('allows an enforced frame-ancestors list that names Aqua, even with SAMEORIGIN', () => {
    const allowed = assessIuChatEmbed({
      aquaOrigin: aqua,
      chatUrl: chat,
      xFrameOptions: 'SAMEORIGIN',
      contentSecurityPolicy: `frame-ancestors 'self' ${aqua}`,
    })
    expect(allowed.frameable).toBe(true)
    expect(allowed.sameSite).toBe(true)
  })

  it('does not treat frame-ancestors self as the Aqua origin', () => {
    expect(
      assessIuChatEmbed({
        aquaOrigin: aqua,
        chatUrl: chat,
        xFrameOptions: null,
        contentSecurityPolicy: "frame-ancestors 'self'",
      }).frameable,
    ).toBe(false)
  })

  it('allows SAMEORIGIN when both sides are the same origin', () => {
    expect(
      assessIuChatEmbed({
        aquaOrigin: chat,
        chatUrl: chat,
        xFrameOptions: 'SAMEORIGIN',
        contentSecurityPolicy: null,
      }).frameable,
    ).toBe(true)
  })
})

describe('IU Chat view decision', () => {
  it('embeds a reachable same-site chat on the web', () => {
    expect(
      decideIuChatView({
        reachable: true,
        frameable: true,
        sameSite: true,
        framingKnown: true,
        native: false,
      }),
    ).toBe('embed')
  })

  it('asks for a full page when the chat is another site or refuses the frame', () => {
    expect(
      decideIuChatView({
        reachable: true,
        frameable: true,
        sameSite: false,
        framingKnown: true,
        native: false,
      }),
    ).toBe('cross-site')
    expect(
      decideIuChatView({
        reachable: true,
        frameable: false,
        sameSite: true,
        framingKnown: true,
        native: false,
      }),
    ).toBe('framing')
  })

  it('embeds in the native webview whenever the server answers', () => {
    expect(
      decideIuChatView({
        reachable: true,
        frameable: false,
        sameSite: false,
        framingKnown: true,
        native: true,
      }),
    ).toBe('embed')
    expect(
      decideIuChatView({
        reachable: false,
        frameable: false,
        sameSite: true,
        framingKnown: true,
        native: true,
      }),
    ).toBe('down')
  })
})

describe('IU Chat icon asset', () => {
  it('keeps the sidebar drawing equal to the designer SVG', () => {
    const file = fs.readFileSync(
      path.join(__dirname, '../../assets/icons/iu-chat.svg'),
      'utf8',
    )
    expect(IU_CHAT_ICON_XML).toBe(file)
    expect(file).not.toContain('<rect')
    expect(file).toContain('#a77bff')
    expect(file).not.toContain('#1c1a24')
  })
})
