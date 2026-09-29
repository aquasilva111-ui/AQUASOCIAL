import {
  getAuthorizedMedia,
  isAdultContent,
  toAccessControlledResource,
  toAdultPost,
} from '#/lib/adult/content'
import {
  blockAdultCreator,
  clearAdultRelationships,
  followAdultCreator,
  isAdultFollowing,
  isCreatorBlocked,
  unblockAdultCreator,
  unfollowAdultCreator,
} from '#/state/adult/relationships'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'

function post(
  uri: string,
  labels: string[] = [],
  filtered = false,
): FeedPostSliceItem {
  const record = {
    $type: 'app.bsky.feed.post',
    text: 'conteúdo',
    createdAt: '2026-01-01T00:00:00Z',
    labels: labels.length
      ? {
          $type: 'com.atproto.label.defs#selfLabels',
          values: labels.map(val => ({val})),
        }
      : undefined,
  }
  return {
    uri,
    _reactKey: uri,
    record,
    post: {
      uri,
      cid: 'cid',
      author: {did: `did:plc:${uri}`, handle: 'creator.test'},
      indexedAt: record.createdAt,
      record,
      embed: {
        $type: 'app.bsky.embed.images#view',
        images: [
          {
            thumb: 'https://example.test/thumb',
            fullsize: 'https://example.test/full',
            alt: '',
          },
        ],
      },
    },
    moderation: {ui: () => ({filter: filtered})},
  } as unknown as FeedPostSliceItem
}

describe('adult content adapter', () => {
  it('identifica conteúdo adulto por self-labels', () => {
    expect(isAdultContent(post('a', ['porn']))).toBe(true)
    expect(isAdultContent(post('b', ['sexual']))).toBe(true)
    expect(isAdultContent(post('c', ['nudity']))).toBe(true)
    expect(isAdultContent(post('d', []))).toBe(false)
    expect(isAdultContent(post('e', ['not-adult']))).toBe(false)
  })

  it('respeita filtros de moderação (blocos, mutes, tombstones)', () => {
    expect(isAdultContent(post('f', ['porn'], true))).toBe(false)
  })

  it('projeta AdultPost com política free/visibilidade pública adulta', () => {
    const adapted = toAdultPost(post('g', ['sexual']))
    expect(adapted).not.toBeNull()
    expect(adapted!.accessPolicy).toBe('free')
    expect(adapted!.visibility).toBe('public_adult')
    expect(adapted!.contentRating).toBe('sexual')
    expect(adapted!.creatorId).toBe('did:plc:g')
  })

  it('recusa posts sem label adulto', () => {
    expect(toAdultPost(post('h'))).toBeNull()
  })

  it('gera o resource do Entitlements sem payload de mídia', () => {
    const adapted = toAdultPost(post('i', ['porn']))!
    const resource = toAccessControlledResource(adapted)
    expect(resource).toEqual({
      id: 'i',
      type: 'post',
      creatorId: 'did:plc:i',
      policy: 'free',
    })
  })

  it('nunca entrega asset protegido quando o acesso é negado', () => {
    const adapted = toAdultPost(post('j', ['porn']))!
    const denied = getAuthorizedMedia(adapted, false)
    expect(denied.preview).toBeUndefined()
    expect(denied.protectedMedia).toBeUndefined()
    const allowed = getAuthorizedMedia(adapted, true)
    expect(allowed.protectedMedia).toBeDefined()
  })
})

describe('adult creator relationships', () => {
  beforeEach(() => clearAdultRelationships())

  it('follow ≠ subscribe: follow é relação adulta privada', () => {
    followAdultCreator('did:plc:me', 'did:plc:creator')
    expect(isAdultFollowing('did:plc:me', 'did:plc:creator')).toBe(true)
    unfollowAdultCreator('did:plc:me', 'did:plc:creator')
    expect(isAdultFollowing('did:plc:me', 'did:plc:creator')).toBe(false)
  })

  it('bloquear creator corta o follow (sem apagar registros financeiros)', () => {
    followAdultCreator('did:plc:me', 'did:plc:creator')
    blockAdultCreator('did:plc:me', 'did:plc:creator')
    expect(isCreatorBlocked('did:plc:me', 'did:plc:creator')).toBe(true)
    expect(isAdultFollowing('did:plc:me', 'did:plc:creator')).toBe(false)
  })

  it('não é possível seguir creator bloqueado', () => {
    blockAdultCreator('did:plc:me', 'did:plc:creator')
    followAdultCreator('did:plc:me', 'did:plc:creator')
    expect(isAdultFollowing('did:plc:me', 'did:plc:creator')).toBe(false)
    unblockAdultCreator('did:plc:me', 'did:plc:creator')
    followAdultCreator('did:plc:me', 'did:plc:creator')
    expect(isAdultFollowing('did:plc:me', 'did:plc:creator')).toBe(true)
  })

  it('relações são isoladas por conta', () => {
    followAdultCreator('did:plc:a', 'did:plc:creator')
    expect(isAdultFollowing('did:plc:b', 'did:plc:creator')).toBe(false)
  })

  it('limpar remove todo o estado adulto', () => {
    followAdultCreator('did:plc:me', 'did:plc:creator')
    blockAdultCreator('did:plc:me', 'did:plc:other')
    clearAdultRelationships()
    expect(isAdultFollowing('did:plc:me', 'did:plc:creator')).toBe(false)
    expect(isCreatorBlocked('did:plc:me', 'did:plc:other')).toBe(false)
  })
})
