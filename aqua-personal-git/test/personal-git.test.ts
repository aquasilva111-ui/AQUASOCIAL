import {describe, expect, it} from 'vitest'

import {
  canonical,
  ConflictError,
  createRepo,
  diffFields,
  hashOf,
  importBranch,
} from '../src/index.ts'

const T = (m: number) => `2026-10-11T10:${String(m).padStart(2, '0')}:00.000Z`
const music = (activation: number) => ({
  type: 'convention',
  key: 'tema:producao-musical',
  label: 'Produção musical',
  activation,
})

describe('hash canônico', () => {
  it('não depende da ordem das chaves nem da forma Unicode', () => {
    expect(canonical({b: 1, a: [2, {d: 1, c: 2}]})).toBe(
      canonical({a: [2, {c: 2, d: 1}], b: 1}),
    )
    expect(hashOf({s: 'música'})).toBe(hashOf({s: 'mu\u0301sica'}))
    expect(hashOf({a: 1, x: undefined})).toBe(hashOf({a: 1}))
    expect(hashOf({a: 1})).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('recusa valores sem forma única', () => {
    expect(() => canonical(Number.NaN)).toThrow()
    expect(() => canonical(new Date())).toThrow()
  })
})

describe('diff semântico', () => {
  it('mostra o campo que mudou', () => {
    expect(diffFields(music(0.42), music(0.71))).toEqual([
      {field: 'activation', before: 0.42, after: 0.71},
    ])
    expect(diffFields({a: {b: 1}}, {a: {b: 1, c: 2}})).toEqual([
      {field: 'a.c', after: 2},
    ])
  })
})

describe('commits', () => {
  it('registra o que mudou, quando, por quê, evidência e certeza', () => {
    const repo = createRepo('did:plc:samu')
    const c1 = repo.commit('private', {
      changes: {'conventions/producao-musical.json': music(0.42)},
      reason: 'primeiros sinais',
      source: 'event_digest',
      evidenceRefs: ['ev:digest:2026-10-10'],
      timestamp: T(0),
    })!
    const c2 = repo.commit('private', {
      changes: {'conventions/producao-musical.json': music(0.71)},
      reason: 'salvamentos repetidos, tempo de vídeo longo, feedback explícito',
      source: 'event_digest',
      evidenceRefs: ['ev:digest:2026-10-11'],
      confidenceChange: {
        path: 'conventions/producao-musical.json',
        field: 'activation',
        before: 0.42,
        after: 0.71,
      },
      timestamp: T(1),
    })!
    expect(c2.parentCommitId).toBe(c1.hash)
    expect(c2.certainty).toBe('inferred')
    expect(c2.changedObjects).toEqual([
      expect.objectContaining({
        path: 'conventions/producao-musical.json',
        kind: 'modified',
        fields: [{field: 'activation', before: 0.42, after: 0.71}],
      }),
    ])
    expect(repo.log('private').map(c => c.hash)).toEqual([c2.hash, c1.hash])
    expect(repo.verify('private')).toBe(true)
  })

  it('não cria commit vazio e o hash é reprodutível', () => {
    const a = createRepo('u')
    const b = createRepo('u')
    const input = {
      changes: {'preferences/explicit.json': {idioma: 'pt'}},
      reason: 'r',
      source: 'explicit_user_input' as const,
      timestamp: T(0),
    }
    expect(a.commit('private', input)!.hash).toBe(
      b.commit('private', input)!.hash,
    )
    expect(a.commit('private', input)).toBeUndefined()
  })

  it('branches são independentes (privado nunca vaza para o público)', () => {
    const repo = createRepo('u')
    repo.commit('private', {
      changes: {'syntheses/x.json': {t: 'privado'}},
      reason: 'r',
      source: 'synthesis',
      timestamp: T(0),
    })
    expect(repo.read('public', 'syntheses/x.json')).toBeUndefined()
    expect(repo.log('public')).toEqual([])
  })
})

describe('revert e rollback', () => {
  const setup = () => {
    const repo = createRepo('u')
    const c1 = repo.commit('private', {
      changes: {'conventions/a.json': {v: 1}},
      reason: '1',
      source: 'event_digest',
      timestamp: T(0),
    })!
    const c2 = repo.commit('private', {
      changes: {'conventions/a.json': {v: 2}, 'conventions/b.json': {v: 1}},
      reason: '2',
      source: 'event_digest',
      timestamp: T(1),
    })!
    return {repo, c1, c2}
  }

  it('revert desfaz um commit com um commit novo', () => {
    const {repo, c2} = setup()
    const r = repo.revert('private', c2.hash, 'interpretação errada')!
    expect(repo.read('private', 'conventions/a.json')).toEqual({v: 1})
    expect(repo.read('private', 'conventions/b.json')).toBeUndefined()
    expect(r.certainty).toBe('explicit')
    expect(r.evidenceRefs).toEqual([c2.hash])
    expect(repo.log('private')).toHaveLength(3)
  })

  it('revert de commit antigo com mudança posterior no mesmo objeto é conflito', () => {
    const {repo, c1} = setup()
    expect(() => repo.revert('private', c1.hash)).toThrow(ConflictError)
  })

  it('restore volta o branch a um estado anterior', () => {
    const {repo, c1} = setup()
    repo.restore('private', c1.hash)
    expect(repo.treeAt(repo.refs.get('private'))).toEqual(repo.treeAt(c1.hash))
    expect(repo.verify('private')).toBe(true)
  })
})

describe('exportar e importar', () => {
  it('ida e volta preserva hashes e detecta adulteração', () => {
    const repo = createRepo('did:plc:samu')
    repo.commit('private', {
      changes: {'contexts/work.json': {peso: 0.5}},
      reason: 'r',
      source: 'manual_edit',
      timestamp: T(0),
    })
    repo.commit('private', {
      changes: {'contexts/work.json': {peso: 0.6}},
      reason: 'r2',
      source: 'ui',
      timestamp: T(1),
    })
    const bundle = repo.exportBranch('private')
    const copy = importBranch(JSON.parse(JSON.stringify(bundle)))
    expect(copy.refs.get('private')).toBe(bundle.head)
    expect(copy.read('private', 'contexts/work.json')).toEqual({peso: 0.6})

    const tampered = JSON.parse(JSON.stringify(bundle))
    tampered.commits[0].reason = 'outra coisa'
    expect(() => importBranch(tampered)).toThrow(/adulterado/)
  })
})
