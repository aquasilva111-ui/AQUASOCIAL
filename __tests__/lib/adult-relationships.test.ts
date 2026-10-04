import {
  clearAdultRelationships,
  followAdultCreator,
  getAdultRelationshipsSnapshot,
  hydrateAdultRelationships,
  isAdultFollowing,
  isCreatorBlocked,
  isCreatorMuted,
} from '#/state/adult/relationships'

const ME = 'did:plc:me'

beforeEach(() => clearAdultRelationships())

describe('adult relationships snapshot', () => {
  // useSyncExternalStore compares by identity: a new object on every call
  // makes React re-render forever (error #185) and crashes the +18 home.
  it('returns the same object until something changes', () => {
    expect(getAdultRelationshipsSnapshot()).toBe(
      getAdultRelationshipsSnapshot(),
    )
    followAdultCreator(ME, 'did:plc:a')
    const after = getAdultRelationshipsSnapshot()
    expect(after).toBe(getAdultRelationshipsSnapshot())
  })

  it('changes identity when a relationship changes', () => {
    const before = getAdultRelationshipsSnapshot()
    followAdultCreator(ME, 'did:plc:a')
    expect(getAdultRelationshipsSnapshot()).not.toBe(before)
  })
})

describe('hydrating from the server copy', () => {
  it('replaces follows, mutes and blocks', () => {
    followAdultCreator(ME, 'did:plc:local')
    hydrateAdultRelationships(ME, {
      follows: ['did:plc:f'],
      mutes: ['did:plc:m'],
      blocks: ['did:plc:b'],
    })
    expect(isAdultFollowing(ME, 'did:plc:f')).toBe(true)
    expect(isAdultFollowing(ME, 'did:plc:local')).toBe(false)
    expect(isCreatorMuted(ME, 'did:plc:m')).toBe(true)
    expect(isCreatorBlocked(ME, 'did:plc:b')).toBe(true)
  })

  it('changes the snapshot so subscribers re-render once', () => {
    const before = getAdultRelationshipsSnapshot()
    hydrateAdultRelationships(ME, {follows: [], mutes: [], blocks: []})
    const after = getAdultRelationshipsSnapshot()
    expect(after).not.toBe(before)
    expect(after).toBe(getAdultRelationshipsSnapshot())
  })
})
