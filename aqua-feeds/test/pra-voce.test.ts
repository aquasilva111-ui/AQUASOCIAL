import {Secp256k1Keypair} from '@atproto/crypto'
import {createServiceJwt} from '@atproto/xrpc-server'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {createForYou, parseKey, reasonsOf} from '../src/algos/for-you/feed.ts'
import {explainCandidate} from '../src/algos/for-you/score.ts'
import {createApp} from '../src/app.ts'
import {createAuth} from '../src/auth.ts'
import {type Config, loadConfig} from '../src/config.ts'
import {historyOf, loadRepo, BRANCH} from '../src/conventions/history.ts'
import {type Adjustment, buildProfile, type Signal} from '../src/conventions/profile.ts'
import {createPgliteDb, type Db, migrate} from '../src/db.ts'
import {createFeed} from '../src/feed.ts'
import {applyOps, toOps} from '../src/jetstream.ts'
import {createStore, type Store} from '../src/store.ts'

const NOW = Date.parse('2026-10-11T12:00:00Z')
const H = 3_600_000
const DAY = 24 * H
const cfg: Config = loadConfig({
  AQUA_FEEDS_ENV: 'test',
  FEEDGEN_HOSTNAME: 'feeds.example.com',
  FEEDGEN_PUBLISHER_DID: 'did:plc:aqua',
  JETSTREAM_ENABLED: '0',
})
const VIEWER = 'did:plc:samu'
const post = (did: string, n: number) => `at://${did}/app.bsky.feed.post/p${n}`

let db: Db
let store: Store
let clock = NOW

beforeEach(async () => {
  db = await createPgliteDb()
  await migrate(db)
  store = createStore(db)
  clock = NOW
})
afterEach(async () => {
  await db.close()
})

/** Post chegando pelo Jetstream (mesmo caminho da produção). */
async function jsPost(did: string, n: number, text: string, at: number, extra = {}) {
  const ops = toOps(
    {
      did,
      time_us: at * 1000,
      kind: 'commit',
      commit: {
        operation: 'create',
        collection: 'app.bsky.feed.post',
        rkey: `p${n}`,
        record: {text, createdAt: new Date(at).toISOString(), langs: ['pt'], ...extra},
      },
    } as never,
    {langs: [], authorDids: []},
  )
  await applyOps(store, ops)
  return post(did, n)
}

async function jsLike(actor: string, subject: string, n: number, at: number) {
  await applyOps(
    store,
    toOps(
      {
        did: actor,
        time_us: at * 1000,
        kind: 'commit',
        commit: {
          operation: 'create',
          collection: 'app.bsky.feed.like',
          rkey: `l${n}`,
          record: {subject: {uri: subject, cid: 'x'}, createdAt: new Date(at).toISOString()},
        },
      } as never,
      {langs: [], authorDids: []},
    ),
  )
}

describe('Jetstream → Convenções do post', () => {
  it('lê #hashtags do texto só quando não há facets', async () => {
    const {tagsOf} = await import('../src/jetstream.ts')
    expect(tagsOf({text: 'oi #Arte e #2026 #açaí_bom'})).toEqual(['arte', 'acai_bom']) // normalizeTag tira acentos
    expect(
      tagsOf({
        text: '#outra',
        facets: [{features: [{$type: 'app.bsky.richtext.facet#tag', tag: 'Certa'}]}],
      }),
    ).toEqual(['certa'])
  })

  it('extrai #tags, idioma, formato, criador e texto; segue vira sinal', async () => {
    const [op] = toOps(
      {
        did: 'did:plc:ana',
        time_us: NOW * 1000,
        kind: 'commit',
        commit: {
          operation: 'create',
          collection: 'app.bsky.feed.post',
          rkey: 'p1',
          record: {text: 'Aquarela de hoje #Arte #Aquarela', createdAt: '', langs: ['pt']},
        },
      } as never,
      {langs: [], authorDids: []},
    )
    expect(op).toMatchObject({type: 'post'})
    const p = (op as {post: {convKeys: string[]; text: string; mediaType: string}}).post
    expect(p.convKeys).toEqual(
      expect.arrayContaining(['tema:arte', 'tema:aquarela', 'idioma:pt', 'formato:text', 'criador:did:plc:ana']),
    )
    expect(p.text).toContain('aquarela de hoje')

    await store.touchViewer(VIEWER)
    const follow = toOps(
      {
        did: VIEWER,
        time_us: NOW * 1000,
        kind: 'commit',
        commit: {
          operation: 'create',
          collection: 'app.bsky.graph.follow',
          rkey: 'f1',
          record: {subject: 'did:plc:ana', createdAt: ''},
        },
      } as never,
      {langs: [], authorDids: []},
    )
    expect(follow).toEqual([expect.objectContaining({type: 'follow', subject: 'did:plc:ana'})])
    await applyOps(store, follow)
    const s = await store.signals(VIEWER, 0)
    expect(s).toEqual([expect.objectContaining({kind: 'follow', keys: ['criador:did:plc:ana']})])
  })

  it('só guarda sinais de quem usa o "Pra você"', async () => {
    const uri = await jsPost('did:plc:ana', 1, '#arte', NOW - H)
    await jsLike('did:plc:estranho', uri, 1, NOW)
    expect(await store.signals('did:plc:estranho', 0)).toEqual([])
    await store.touchViewer(VIEWER)
    await jsLike(VIEWER, uri, 2, NOW)
    expect((await store.signals(VIEWER, 0))[0]!.keys).toContain('tema:arte')
  })
})

describe('perfil de Convenções: decaimento e ajustes', () => {
  const likes = (key: string, n: number, at: number): Signal[] =>
    Array.from({length: n}, (_, i) => ({kind: 'like', at: at - i * DAY, keys: [key], subject: `s${key}${i}`}))

  it('gravidade cai pela metade a cada 14 dias sem uso e o estado acompanha', () => {
    const sig = likes('tema:arte', 5, NOW)
    const hoje = buildProfile(sig, [], NOW).conventions[0]!
    const depois = buildProfile(sig, [], NOW + 14 * DAY).conventions[0]!
    const fraca = buildProfile(sig, [], NOW + 20 * DAY).conventions[0]!
    const muito = buildProfile(sig, [], NOW + 70 * DAY).conventions[0]!
    expect(depois.gravidade / hoje.gravidade).toBeCloseTo(0.5, 2)
    expect(hoje.estado).not.toBe('dormente')
    expect(fraca.estado).toBe('enfraquecendo')
    expect(muito.estado).toBe('dormente')
    expect(hoje).toMatchObject({fonte: 'aqua', status: 'hipótese', certeza: 'inferido'})
  })

  it('add explícito, boost, mute, delete e wrong', () => {
    const sig = likes('tema:arte', 3, NOW - H)
    const base = buildProfile(sig, [], NOW).conventions[0]!

    const add = buildProfile([], [{key: 'tema:jazz', action: 'add', at: NOW}], NOW).conventions[0]!
    expect(add).toMatchObject({key: 'tema:jazz', fonte: 'usuario', status: 'confirmado', gravidade: 3})

    const boost = buildProfile(sig, [{key: 'tema:arte', action: 'boost', factor: 2, at: NOW}], NOW)
    expect(boost.conventions[0]!.gravidade).toBeCloseTo(base.gravidade * 2, 2)
    const boostMax = buildProfile(sig, [{key: 'tema:arte', action: 'boost', factor: 99, at: NOW}], NOW)
    expect(boostMax.conventions[0]!.boost).toBe(4)

    const mute = buildProfile(sig, [{key: 'tema:arte', action: 'mute', at: NOW}], NOW)
    expect(mute.conventions[0]).toMatchObject({silenciada: true, gravidade: 0})
    expect(mute.viewer.muted!.has('tema:arte')).toBe(true)
    expect(mute.viewer.conventionGravity!.has('tema:arte')).toBe(false)

    const del = buildProfile(sig, [{key: 'tema:arte', action: 'delete', at: NOW}], NOW)
    expect(del.conventions).toEqual([])
    // depois de apagar, sinais novos voltam a contar
    const novo = buildProfile([...sig, ...likes('tema:arte', 1, NOW + H)], [{key: 'tema:arte', action: 'delete', at: NOW}], NOW + 2 * H)
    expect(novo.conventions[0]!.sinais.like).toBe(1)

    // "está errada": esquece e não volta a inferir, nem com sinais novos
    const wrong = buildProfile([...sig, ...likes('tema:arte', 2, NOW + H)], [{key: 'tema:arte', action: 'wrong', at: NOW}], NOW + 2 * H)
    expect(wrong.conventions).toEqual([])
    expect(wrong.blocked).toEqual(['tema:arte'])
  })

  it('valida e normaliza as chaves de ajuste', () => {
    expect(parseKey('tema:#Arte')).toBe('tema:arte')
    expect(parseKey('criador:did:plc:Ana')).toBe('criador:did:plc:Ana')
    expect(() => parseKey('qualquer:coisa')).toThrow()
    expect(() => parseKey('semdoispontos')).toThrow()
  })
})

describe('ranking e explicação', () => {
  async function cenario() {
    const arte = await jsPost('did:plc:ana', 1, 'nova pintura #arte', NOW - 2 * H)
    const alta = await jsPost('did:plc:bia', 2, 'resultado do jogo #futebol', NOW - 2 * H)
    for (let i = 0; i < 3; i++) await jsLike(`did:plc:f${i}`, alta, i, NOW - H)
    await store.touchViewer(VIEWER)
    const antigos = []
    for (let i = 0; i < 3; i++)
      antigos.push(await jsPost(`did:plc:x${i}`, 10 + i, `estudo ${i} #arte`, NOW - 30 * H))
    for (const [i, u] of antigos.entries()) await jsLike(VIEWER, u, 100 + i, NOW - 25 * H + i)
    return {arte, alta}
  }

  it('o post que bate com suas Convenções passa o que só está em alta', async () => {
    const {arte, alta} = await cenario()
    const fy = createForYou(store, cfg, () => clock)
    const anon = await fy.skeleton({})
    expect(anon.feed[0]!.post).toBe(alta)
    const pessoal = await fy.skeleton({viewer: VIEWER})
    expect(pessoal.feed[0]!.post).toBe(arte)
    const ctx = JSON.parse(pessoal.feed[0]!.feedContext)
    expect(ctx).toMatchObject({v: 1, a: 'pra-voce'})
    expect(ctx.c.map((c: unknown[]) => c[0])).toContain('tema:arte')
    expect(pessoal.feed[0]!.feedContext.length).toBeLessThanOrEqual(2000)
  })

  it('explicação: soma das partes = pontuação, com motivos em português', async () => {
    const {arte} = await cenario()
    const fy = createForYou(store, cfg, () => clock)
    const out = (await fy.explain(VIEWER, arte))!
    const e = out.explicacao
    const soma = e.base + e.contributions.reduce((s, c) => s + c.points, 0) + e.hot.points
    expect(e.score).toBeCloseTo(soma, 6)
    expect(out.motivos.join(' ')).toMatch(/arte/)
    expect(out.motivos.join(' ')).toMatch(/Frescor/)
    expect(await fy.explain(VIEWER, post('did:plc:ninguem', 9))).toBeUndefined()
  })

  it('silenciar derruba o post e aparece na explicação; "mostrar menos" também', async () => {
    const {arte} = await cenario()
    const fy = createForYou(store, cfg, () => clock)
    await fy.adjust(VIEWER, {key: 'tema:arte', action: 'mute'})
    const out = (await fy.explain(VIEWER, arte))!
    expect(out.explicacao.penalties).toEqual([expect.objectContaining({reason: 'silenciada', key: 'tema:arte'})])
    expect(reasonsOf(out.explicacao).join(' ')).toMatch(/silenciou/)
    await fy.addSignal(VIEWER, 'less', arte)
    const de = (await fy.explain(VIEWER, arte))!.explicacao
    expect(de.penalties.map(p => p.reason)).toContain('mostrar-menos')
  })

  it('páginas seguem o mesmo ranking (cursor <ts>::<offset>)', async () => {
    await cenario()
    const fy = createForYou(store, cfg, () => clock)
    const p1 = await fy.skeleton({viewer: VIEWER, limit: 2})
    clock += 60_000
    const p2 = await fy.skeleton({viewer: VIEWER, limit: 10, cursor: p1.cursor})
    const all = [...p1.feed, ...p2.feed].map(i => i.post)
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(5)
    expect(p1.cursor).toMatch(/^\d+::2$/)
  })

  it('perfil vazio não quebra a explicação', () => {
    const e = explainCandidate(
      {uri: 'u', author: 'a', indexedAt: new Date(NOW).toISOString(), mediaType: 'text', likeCount: 0, repostCount: 0, replyCount: 0},
      {authorAffinity: new Map(), mediaAffinity: new Map(), seen: new Set(), lessPosts: new Set()},
      NOW,
    )
    expect(reasonsOf(e).at(-1)).toMatch(/Nenhuma Convenção/)
  })
})

describe('histórico no Git pessoal', () => {
  it('resumo inferido (hipótese) + ajustes explícitos (confirmado), com tendência', async () => {
    const uri = await jsPost('did:plc:ana', 1, '#arte', NOW - 2 * H)
    await store.touchViewer(VIEWER)
    await jsLike(VIEWER, uri, 1, NOW - H)
    const fy = createForYou(store, {...cfg, digestHours: 6}, () => clock)

    const p1 = await fy.getProfile(VIEWER)
    expect(p1.convencoes.map(c => c.key)).toContain('tema:arte')
    await fy.getProfile(VIEWER) // dentro de 6 h: sem novo resumo
    await fy.adjust(VIEWER, {key: 'tema:jazz', action: 'add', note: 'gosto muito'})
    await fy.adjust(VIEWER, {key: 'tema:arte', action: 'boost', factor: 3})
    clock += 7 * H
    await fy.getProfile(VIEWER)

    const h = await fy.getHistory(VIEWER)
    expect(h.verificado).toBe(true)
    expect(h.historico.map(e => [e.fonte, e.certeza])).toEqual([
      ['aqua', 'inferido'],
      ['usuario', 'explicito'],
      ['usuario', 'explicito'],
      ['aqua', 'inferido'],
    ])
    expect(h.historico[2]!.reason).toMatch(/adicionou.*tema:jazz.*gosto muito/)
    const soArte = await fy.getHistory(VIEWER, 'tema:arte')
    expect(soArte.historico.every(e => e.changes.every(c => c.key === 'tema:arte'))).toBe(true)

    const p2 = await fy.getProfile(VIEWER)
    const arte = p2.convencoes.find(c => c.key === 'tema:arte')!
    expect(arte.tendencia.length).toBeGreaterThanOrEqual(2)

    // o que fica guardado está no formato da Base de Sínteses
    const repo = loadRepo(VIEWER, await store.getRepoBundle(VIEWER))
    const head = repo.treeAt(repo.refs.get(BRANCH))
    const paths = Object.keys(head)
    expect(paths.every(p => /^7-convencoes-de-realidade\/convencoes\/[0-9a-f]{16}\.json$/.test(p))).toBe(true)
    const jazz = paths.map(p => repo.read(BRANCH, p) as Record<string, unknown>).find(o => o.tipo === 'tema' && (o.nomes as string[])[0] === 'jazz')!
    expect(jazz).toMatchObject({fonte: 'usuario', status: 'confirmado', esfera: 3})
    expect(historyOf(repo).length).toBe(4)
  })

  it('apagar remove o arquivo da Convenção num commit explícito', async () => {
    const fy = createForYou(store, cfg, () => clock)
    await fy.adjust(VIEWER, {key: 'tema:jazz', action: 'add'})
    clock += 1000
    const r = await fy.adjust(VIEWER, {key: 'tema:jazz', action: 'delete'})
    expect(r.convencao).toBeNull()
    const h = await fy.getHistory(VIEWER, 'tema:jazz')
    expect(h.historico[0]!.changes[0]!.kind).toBe('removed')
  })
})

describe('endpoints com JWT de serviço', () => {
  async function setup() {
    const key = await Secp256k1Keypair.create()
    const auth = createAuth(cfg, async () => key.did())
    const fy = createForYou(store, cfg, () => clock)
    const app = createApp(cfg, createFeed(store, cfg, () => clock), {forYou: fy, auth})
    const jwt = (lxm: string, aud = cfg.serviceDid) =>
      createServiceJwt({iss: VIEWER, aud, lxm, keypair: key}).then(t => ({authorization: `Bearer ${t}`}))
    return {app, jwt}
  }

  it('describe lista os dois feeds; skeleton funciona logado e sem login', async () => {
    const {app, jwt} = await setup()
    await jsPost('did:plc:ana', 1, '#arte', NOW - H)
    const d = await (await app.request('/xrpc/app.bsky.feed.describeFeedGenerator')).json()
    expect(d.feeds.map((f: {uri: string}) => f.uri)).toEqual([cfg.feedUri, cfg.forYouUri])
    const q = `/xrpc/app.bsky.feed.getFeedSkeleton?feed=${encodeURIComponent(cfg.forYouUri)}`
    const anon = await app.request(q)
    expect(anon.status).toBe(200)
    const logged = await app.request(q, {headers: await jwt('app.bsky.feed.getFeedSkeleton')})
    const body = await logged.json()
    expect(body.feed[0].feedContext).toContain('pra-voce')
    expect(body.reqId).toMatch(/^pv-/)
  })

  it('getProfile exige login; token de outro serviço ou método é recusado', async () => {
    const {app, jwt} = await setup()
    const url = '/xrpc/place.aqua.convencoes.getProfile'
    expect((await app.request(url)).status).toBe(401)
    expect((await app.request(url, {headers: await jwt('place.aqua.convencoes.adjust')})).status).toBe(401)
    expect((await app.request(url, {headers: await jwt(url.slice(6), 'did:web:outro.example')})).status).toBe(401)
    expect((await app.request(url, {headers: await jwt('place.aqua.convencoes.getProfile')})).status).toBe(200)
  })

  it('adjust, sendInteractions, sendSignals e explain', async () => {
    const {app, jwt} = await setup()
    const uri = await jsPost('did:plc:ana', 1, 'pintura #arte', NOW - H)
    const adj = await app.request('/xrpc/place.aqua.convencoes.adjust', {
      method: 'POST',
      headers: {...(await jwt('place.aqua.convencoes.adjust')), 'content-type': 'application/json'},
      body: JSON.stringify({key: 'tema:arte', action: 'add'}),
    })
    expect(adj.status).toBe(200)
    expect((await adj.json()).convencao).toMatchObject({key: 'tema:arte', fonte: 'usuario'})
    const bad = await app.request('/xrpc/place.aqua.convencoes.adjust', {
      method: 'POST',
      headers: {...(await jwt('place.aqua.convencoes.adjust')), 'content-type': 'application/json'},
      body: JSON.stringify({key: 'x', action: 'add'}),
    })
    expect(bad.status).toBe(400)

    const si = await app.request('/xrpc/app.bsky.feed.sendInteractions', {
      method: 'POST',
      headers: {...(await jwt('app.bsky.feed.sendInteractions')), 'content-type': 'application/json'},
      body: JSON.stringify({interactions: [{item: uri, event: 'app.bsky.feed.defs#requestMore'}, {item: 'lixo', event: 'app.bsky.feed.defs#requestLess'}]}),
    })
    expect(await si.json()).toEqual({aceitas: 1})
    const ss = await app.request('/xrpc/place.aqua.feed.sendSignals', {
      method: 'POST',
      headers: {...(await jwt('place.aqua.feed.sendSignals')), 'content-type': 'application/json'},
      body: JSON.stringify({signals: [{kind: 'save', uri}, {kind: 'dwell', uri, seconds: 40}]}),
    })
    expect(await ss.json()).toEqual({aceitas: 2})
    expect((await store.signals(VIEWER, 0)).map(s => s.kind).sort()).toEqual(['dwell', 'more', 'save'])

    const ex = await app.request(`/xrpc/place.aqua.feed.explain?uri=${encodeURIComponent(uri)}`, {
      headers: await jwt('place.aqua.feed.explain'),
    })
    const exb = await ex.json()
    expect(exb.personalizado).toBe(true)
    expect(exb.motivos.join(' ')).toMatch(/arte/)
    expect((await app.request('/xrpc/place.aqua.feed.explain?uri=x')).status).toBe(400)
  })

  it('setSensitive exige login e valida a categoria', async () => {
    const {app, jwt} = await setup()
    const url = '/xrpc/place.aqua.convencoes.setSensitive'
    const post = async (body: unknown, auth = true) =>
      app.request(url, {
        method: 'POST',
        headers: {...(auth ? await jwt('place.aqua.convencoes.setSensitive') : {}), 'content-type': 'application/json'},
        body: JSON.stringify(body),
      })
    expect((await post({categoria: 'saude', ativa: true}, false)).status).toBe(401)
    expect((await post({categoria: 'nada', ativa: true})).status).toBe(400)
    expect((await post({categoria: 'saude', ativa: 'sim'})).status).toBe(400)
    const ok = await post({categoria: 'saude', ativa: true})
    expect(await ok.json()).toMatchObject({categoria: 'saude', ativa: true})
  })

  it('cabeçalho de desenvolvimento só vale fora de produção e se ligado', async () => {
    const devCfg = loadConfig({AQUA_FEEDS_ENV: 'development', FEEDGEN_HOSTNAME: 'localhost', AUTH_DEV_VIEWER_HEADER: '1'})
    expect(await createAuth(devCfg, async () => '')({devViewer: VIEWER}, 'x')).toBe(VIEWER)
    expect(await createAuth(cfg, async () => '')({devViewer: VIEWER}, 'x')).toBeUndefined()
  })
})

describe('categorias sensíveis (desligadas por padrão)', () => {
  const sig = (keys: string[], n: number): Signal[] =>
    Array.from({length: n}, (_, i) => ({kind: 'like', at: NOW - i * H, keys, subject: `s${i}`}))

  it('classifica pela lista explícita (tema, prefixo e rótulo +18)', async () => {
    const {createSensitiveIndex} = await import('../src/conventions/sensitive.ts')
    const idx = createSensitiveIndex()
    expect(idx.categoryOf('tema:saúde-mental')).toBe('saude')
    expect(idx.categoryOf('tema:Eleições')).toBe('politica')
    expect(idx.categoryOf('tema:lgbtqia')).toBe('sexualidade')
    expect(idx.categoryOf('rotulo:porn')).toBe('adulto')
    expect(idx.categoryOf('tema:sindicato')).toBe('sindicato')
    expect(idx.categoryOf('tema:dividas')).toBe('financas-pessoais')
    expect(idx.categoryOf('tema:quilombola')).toBe('etnia-raca')
    expect(idx.categoryOf('tema:arte')).toBeUndefined()
    expect(idx.categoryOf('idioma:pt')).toBeUndefined()
  })

  it('não infere por padrão; opt-in liga; opt-out tira de novo', () => {
    const s = sig(['tema:arte', 'tema:saude-mental', 'rotulo:porn'], 4)
    const keys = (adj: Adjustment[]) => buildProfile(s, adj, NOW).conventions.map(c => c.key).sort()
    expect(keys([])).toEqual(['tema:arte'])
    const on = [{key: 'sensivel:saude', action: 'optin' as const, at: NOW - 1}]
    expect(keys(on)).toEqual(['tema:arte', 'tema:saude-mental'])
    expect(buildProfile(s, on, NOW).sensitiveOptIn).toEqual(['saude'])
    const off = [...on, {key: 'sensivel:saude', action: 'optout' as const, at: NOW}]
    expect(keys(off)).toEqual(['tema:arte'])
    // sensível também não forma Sinapse sem opt-in
    const syn = buildProfile(s, [], NOW).viewer.synapses!
    expect([...syn.keys()].some(k => k.includes('saude'))).toBe(false)
  })

  it('Convenção sensível adicionada pelo usuário continua valendo', () => {
    const p = buildProfile(sig(['tema:saude-mental'], 3), [{key: 'tema:saude-mental', action: 'add', at: NOW - 5 * H}], NOW)
    expect(p.conventions[0]).toMatchObject({key: 'tema:saude-mental', fonte: 'usuario'})
    expect(p.conventions[0]!.sinais.like).toBeGreaterThan(0)
    expect(p.viewer.conventionGravity!.get('tema:saude-mental')).toBeGreaterThan(0)
  })

  it('endpoint: lista as categorias desligadas, liga/desliga e registra no histórico', async () => {
    const uri = await jsPost('did:plc:ana', 1, 'cuidando da #saudemental e da #arte', NOW - 2 * H)
    await store.touchViewer(VIEWER)
    await jsLike(VIEWER, uri, 1, NOW - H)
    const fy = createForYou(store, cfg, () => clock)

    const p0 = await fy.getProfile(VIEWER)
    expect(p0.categoriasSensiveis.every(c => !c.ativa)).toBe(true)
    expect(p0.categoriasSensiveis.map(c => c.id)).toEqual([
      'saude', 'politica', 'religiao', 'sexualidade', 'adulto', 'etnia-raca', 'sindicato', 'financas-pessoais',
    ])
    expect(p0.convencoes.map(c => c.key)).not.toContain('tema:saudemental')

    clock += 1000
    const on = await fy.setSensitive(VIEWER, {categoria: 'saude', ativa: true})
    expect(on.commit).toBeTruthy()
    const p1 = await fy.getProfile(VIEWER)
    expect(p1.convencoes.map(c => c.key)).toContain('tema:saudemental')
    expect(p1.categoriasSensiveis.find(c => c.id === 'saude')!.ativa).toBe(true)

    clock += 1000
    await fy.setSensitive(VIEWER, {categoria: 'saude', ativa: false})
    const p2 = await fy.getProfile(VIEWER)
    expect(p2.convencoes.map(c => c.key)).not.toContain('tema:saudemental')

    const h = (await fy.getHistory(VIEWER)).historico
    expect(h[0]!.reason).toMatch(/desligou.*Saúde/)
    expect(h[0]!.changes.map(c => c.key).sort()).toEqual(['sensiveis.json', 'tema:saudemental'])
    expect(h[0]!.changes.find(c => c.key === 'tema:saudemental')!.kind).toBe('removed')
    expect(h[1]!.reason).toMatch(/permitiu.*Saúde/)
    expect(h[1]!.certeza).toBe('explicito')
    await expect(fy.setSensitive(VIEWER, {categoria: 'xyz', ativa: true})).rejects.toThrow()
  })
})
