import {describe, expect, it} from 'vitest'

import {
  aceitar,
  caminhoDe,
  canonical,
  ConflictError,
  createFila,
  createRepo,
  diffFields,
  FormatoError,
  hashOf,
  importBranch,
  novaConvencao,
  novaSinapse,
  paraRegistroPublico,
  proporInferenciaAqua,
} from '../src/index.ts'

const T = (m: number) => `2026-10-11T10:${String(m).padStart(2, '0')}:00.000Z`
const musica = (forca: number, extra: Record<string, unknown> = {}) => ({
  ...novaConvencao({tipo: 'tema', nome: 'Produção musical', agora: T(0)}),
  forca,
  ...extra,
})
const M = caminhoDe('convencoes', musica(1))

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
    expect(diffFields(musica(1), musica(2))).toEqual([
      {field: 'forca', before: 1, after: 2},
    ])
    expect(diffFields({a: {b: 1}}, {a: {b: 1, c: 2}})).toEqual([
      {field: 'a.c', after: 2},
    ])
  })
})

describe('commits no layout das 7 Esferas', () => {
  it('registra o que mudou, quando, por quê, evidência, fonte e status', () => {
    expect(M).toMatch(
      /^7-convencoes-de-realidade\/convencoes\/[0-9a-f]{16}\.json$/,
    )
    const repo = createRepo('did:plc:samu')
    const c1 = repo.commit('private', {
      changes: {[M]: musica(1)},
      reason: 'primeiros sinais',
      fonte: 'aqua',
      evidenceRefs: ['ev:digest:2026-10-10'],
      timestamp: T(0),
    })!
    const c2 = repo.commit('private', {
      changes: {[M]: musica(2, {gravidade: 0.71, estado: 'ativa'})},
      reason: 'salvamentos repetidos, tempo de vídeo longo',
      fonte: 'aqua',
      evidenceRefs: ['ev:digest:2026-10-11'],
      confidenceChange: {path: M, field: 'gravidade', before: 0, after: 0.71},
      timestamp: T(1),
    })!
    expect(c2.parentCommitId).toBe(c1.hash)
    expect(c2.status).toBe('hipótese')
    expect(c2.changedObjects[0]!.fields).toEqual([
      {field: 'estado', after: 'ativa'},
      {field: 'forca', before: 1, after: 2},
      {field: 'gravidade', after: 0.71},
    ])
    expect(repo.log('private').map(c => c.hash)).toEqual([c2.hash, c1.hash])
    expect(repo.verify('private')).toBe(true)
  })

  it('não cria commit vazio e o hash é reprodutível', () => {
    const a = createRepo('u')
    const b = createRepo('u')
    const input = {
      changes: {'manifest.json': {formato: 1}},
      reason: 'r',
      fonte: 'usuario',
      timestamp: T(0),
    }
    const ca = a.commit('private', input)!
    expect(ca.hash).toBe(b.commit('private', input)!.hash)
    expect(ca.status).toBe('confirmado')
    expect(a.commit('private', input)).toBeUndefined()
  })

  it('recusa objeto fora do lugar ou com id que não é o do significado', () => {
    const repo = createRepo('u')
    const c = musica(1)
    const tenta = (changes: Record<string, unknown>) => () =>
      repo.commit('private', {changes, reason: 'r', fonte: 'aqua', timestamp: T(0)})
    expect(tenta({[M]: {...c, tipo: 'outro'}})).toThrow(/significado/)
    const s = novaSinapse({origem: c.id, destino: c.id, tipo: 'leva a', esfera: 4})
    expect(tenta({[caminhoDe('sinapses', {...s, esfera: 2})]: s})).toThrow(
      FormatoError,
    )
    expect(tenta({[caminhoDe('sinapses', s)]: s})).not.toThrow()
  })

  it('ia-chats e dados/ nunca entram no branch público nem no PDS', () => {
    const repo = createRepo('u')
    const chat = {id: 'ab'.repeat(32), mensagens: [{papel: 'humano', texto: 'oi'}]}
    for (const caminho of ['ia-chats/abababababababab.json', 'dados/x.json']) {
      expect(() =>
        repo.commit('public', {
          changes: {[caminho]: chat},
          reason: 'r',
          fonte: 'usuario',
          timestamp: T(0),
        }),
      ).toThrow(/privado/)
      expect(() => paraRegistroPublico(caminho, chat)).toThrow(/privado/)
    }
    const pub = paraRegistroPublico(M, {...musica(1), proposta_por: 'x'})
    expect(pub.collection).toBe('place.aqua.semantic.convencao')
    expect(pub.rkey).toBe(musica(1).id.slice(0, 16))
    expect(pub.record).not.toHaveProperty('proposta_por')
    expect(pub.record.hashConteudo).toMatch(/^sha256:/)
  })
})

describe('pendentes: inferência da Aqua só entra com aceite', () => {
  it('propõe como hipótese pela 3ª Esfera e grava "confirmado" ao aceitar', () => {
    const fila = createFila()
    const c = {...musica(1), gravidade: 2.5, estado: 'ativa' as const}
    const id = proporInferenciaAqua(fila, 'convencoes', c, {
      motivo: 'curtidas e salvamentos repetidos',
      evidencias: ['ev:digest:2026-10-11#musica'],
      agora: T(0),
    })
    expect(id).toMatch(/^[0-9a-f]{16}$/)
    expect(fila.abertas()[0]).toMatchObject({
      estado: 'aberta',
      fonte: 'aqua',
      proposta: {objeto: {status: 'hipótese', fonte: 'aqua', esfera: 3}},
    })
    expect(fila.abertas()[0]!.proposta.objeto).not.toHaveProperty('gravidade')
    proporInferenciaAqua(fila, 'convencoes', c, {motivo: 'x', agora: T(1)})
    expect(fila.abertas()).toHaveLength(1)

    const mudanca = aceitar(fila, id, T(2))!
    expect(Object.keys(mudanca)).toEqual([M])
    expect(mudanca[M]).toMatchObject({status: 'confirmado', fonte: 'aqua'})
    expect(fila.abertas()).toEqual([])
    const commit = createRepo('u').commit('private', {
      changes: mudanca,
      reason: 'aceito pelo usuário',
      fonte: 'aqua',
      status: 'confirmado',
      evidenceRefs: [`pendente:${id}`],
      timestamp: T(2),
    })!
    expect(commit.status).toBe('confirmado')
  })

  it('recusar não devolve nada para gravar', () => {
    const fila = createFila()
    const id = proporInferenciaAqua(fila, 'convencoes', musica(1), {motivo: 'x'})
    fila.resolver(id, 'recusada')
    expect(aceitar(fila, id)).toBeUndefined()
  })
})

describe('revert e rollback', () => {
  const setup = () => {
    const repo = createRepo('u')
    const arte = novaConvencao({tipo: 'tema', nome: 'arte', agora: T(0)})
    const A = caminhoDe('convencoes', arte)
    const c1 = repo.commit('private', {
      changes: {[M]: musica(1)},
      reason: '1',
      fonte: 'aqua',
      timestamp: T(0),
    })!
    const c2 = repo.commit('private', {
      changes: {[M]: musica(2), [A]: arte},
      reason: '2',
      fonte: 'aqua',
      timestamp: T(1),
    })!
    return {repo, c1, c2, A}
  }

  it('revert desfaz um commit com um commit novo', () => {
    const {repo, c2, A} = setup()
    const r = repo.revert('private', c2.hash, 'interpretação errada')!
    expect(repo.read('private', M)).toEqual(musica(1))
    expect(repo.read('private', A)).toBeUndefined()
    expect(r).toMatchObject({status: 'confirmado', fonte: 'edicao-manual'})
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
      changes: {[M]: musica(1)},
      reason: 'r',
      fonte: 'usuario',
      timestamp: T(0),
    })
    repo.commit('private', {
      changes: {[M]: musica(2)},
      reason: 'r2',
      fonte: 'sono',
      timestamp: T(1),
    })
    const bundle = repo.exportBranch('private')
    expect(bundle.format).toBe('aqua-personal-git/2')
    const copy = importBranch(JSON.parse(JSON.stringify(bundle)))
    expect(copy.refs.get('private')).toBe(bundle.head)
    expect(copy.read('private', M)).toEqual(musica(2))
    const tampered = JSON.parse(JSON.stringify(bundle))
    tampered.commits[0].reason = 'outra coisa'
    expect(() => importBranch(tampered)).toThrow(/adulterado/)
  })
})
