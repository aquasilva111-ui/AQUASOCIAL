// O formato da Base de Sínteses (repo base-de-sinteses, escrito pela U.I. em
// I.U-A.I/repositorio.py) em TypeScript: 7 Esferas, campos em português e
// as mesmas regras de identidade, byte a byte, que o Python. Referência só de
// leitura: nada aqui escreve na base nem na U.I.
//
// Duas identidades, de propósito:
//   • id (significado)   gerarId(...) = sha256 hex do JSON de [estrutura, ...partes],
//                        igual a repositorio.py:68-75. Não muda quando força,
//                        descrição ou status mudam. Nome do arquivo = id[:16].
//   • hash (conteúdo)    hashOf(objeto) = "sha256:" do JSON canônico do objeto
//                        inteiro (canonical.ts). Muda a cada versão; é o que entra
//                        na árvore, no commit e na prova da 616.
import {createHash} from 'node:crypto'

import {hashOf, type Hash, type Json} from './canonical.ts'

// ---------- identidade (paridade com o Python) ----------

/** Os caracteres que o str.split() do Python trata como espaço (≠ \s do JS:
 * o Python inclui U+001C–U+001F e U+0085; o JS inclui U+FEFF). */
const ESPACOS_PYTHON =
  /[\t\n\v\f\r\u001c-\u001f \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/u

/** normalizar() do repositorio.py: NFKC, minúsculas, espaços colapsados. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFKC')
    .toLowerCase()
    .split(ESPACOS_PYTHON)
    .filter(Boolean)
    .join(' ')
}

const SURROGATE_ISOLADO =
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

function textoPython(s: string): string {
  // O Python não consegue gravar surrogates isolados em UTF-8 (erro); o JS os
  // escaparia. Recusar mantém os dois lados iguais.
  if (SURROGATE_ISOLADO.test(s))
    throw new TypeError('texto com surrogate isolado não tem id')
  // JSON.stringify e json.dumps(ensure_ascii=False) escapam exatamente o
  // mesmo conjunto (", \, U+0000–U+001F) com as mesmas formas.
  return JSON.stringify(s)
}

export const porCodePoint = (a: string, b: string) => {
  const x = [...a]
  const y = [...b]
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!
    if (d) return d
  }
  return x.length - y.length
}

/**
 * json.dumps(valor, ensure_ascii=False, separators=…, sort_keys=…) do Python.
 * Números: só inteiros seguros (um float inteiro como 1.0 sai "1.0" no Python
 * e "1" no JS, então não há como garantir paridade).
 */
export function jsonPython(
  valor: unknown,
  opcoes: {compacto?: boolean; ordenar?: boolean} = {},
): string {
  const {compacto = true, ordenar = false} = opcoes
  const virgula = compacto ? ',' : ', '
  const doisPontos = compacto ? ':' : ': '
  const ir = (v: unknown): string => {
    if (v === null) return 'null'
    if (v === true) return 'true'
    if (v === false) return 'false'
    if (typeof v === 'string') return textoPython(v)
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v))
        throw new TypeError('só inteiros têm paridade com o Python')
      return String(v)
    }
    if (Array.isArray(v)) return `[${v.map(ir).join(virgula)}]`
    if (typeof v === 'object') {
      const proto = Object.getPrototypeOf(v)
      if (proto !== Object.prototype && proto !== null)
        throw new TypeError('só objetos simples')
      const o = v as Record<string, unknown>
      let chaves = Object.keys(o).filter(k => o[k] !== undefined)
      if (ordenar) chaves = chaves.sort(porCodePoint)
      return `{${chaves
        .map(k => `${textoPython(k)}${doisPontos}${ir(o[k])}`)
        .join(virgula)}}`
    }
    throw new TypeError(`tipo sem paridade: ${typeof v}`)
  }
  return ir(valor)
}

/** gerar_id(estrutura, *partes) do repositorio.py: sha256 hex (64). */
export function gerarId(estrutura: string, ...partes: unknown[]): string {
  return createHash('sha256')
    .update(jsonPython([estrutura, ...partes]), 'utf8')
    .digest('hex')
}

export type Ancora = readonly [fonte: string, valor: string]

/** Com âncora (ex.: ["wikidata","Q155"]) a identidade é o número, em qualquer língua. */
export function idConvencao(
  c: {tipo: string; nome: string} | {ancora: Ancora},
): string {
  return 'ancora' in c
    ? gerarId('convencao', c.ancora[0], c.ancora[1])
    : gerarId('convencao', normalizar(c.tipo), normalizar(c.nome))
}

export function idSinapse(
  origem: string,
  destino: string,
  tipo: string,
  contexto = '',
): string {
  return gerarId(
    'sinapse',
    origem,
    destino,
    normalizar(tipo),
    normalizar(contexto),
  )
}

/** A identidade da Síntese é o conjunto de Sinapses, não o nome. */
export function idSintese(sinapses: readonly string[]): string {
  return gerarId('sintese', [...new Set(sinapses)].sort(porCodePoint))
}

/** _chave() do pendentes.py: id curto de uma proposta (sem pendente_id/procedencia). */
export function chavePendente(proposta: Record<string, unknown>): string {
  const limpa: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(proposta))
    if (k !== 'pendente_id' && k !== 'procedencia') limpa[k] = v
  return gerarId(
    'pendente',
    jsonPython(limpa, {compacto: false, ordenar: true}),
  ).slice(0, 16)
}

// ---------- as 7 Esferas e o layout das pastas ----------

export const ESFERAS = {
  7: '7-convencoes-de-realidade',
  6: '6-intelectual',
  5: '5-comunicacao',
  4: '4-conexao',
  3: '3-ego',
  2: '2-criacao',
  1: '1-existencia',
} as const
export type Esfera = keyof typeof ESFERAS
/** Toda identidade nasce na 7ª: as Convenções sempre moram lá. */
export const CASA_DAS_CONVENCOES: Esfera = 7
/** O que é ensinado (e o que a Aqua infere) entra pela 3ª, Ego. */
export const ESFERA_DE_ENTRADA: Esfera = 3
export const PASTAS = ['convencoes', 'sinapses', 'sinteses'] as const
export type Pasta = (typeof PASTAS)[number]
/** Conversas lidas de IA-Chats: texto bruto, NUNCA vão para o branch público. */
export const PASTA_IA_CHATS = 'ia-chats'

export function ehEsfera(n: unknown): n is Esfera {
  return typeof n === 'number' && Object.hasOwn(ESFERAS, n)
}

/** Caminho na árvore, igual ao do repositorio.py (Convenção: sempre na 7ª). */
export function caminhoDe(
  pasta: Pasta,
  objeto: {id: string; esfera?: number | null},
): string {
  const esfera =
    pasta === 'convencoes'
      ? CASA_DAS_CONVENCOES
      : (objeto.esfera ?? ESFERA_DE_ENTRADA)
  if (!ehEsfera(esfera)) throw new Error(`Esfera inválida: ${esfera}`)
  if (!/^[0-9a-f]{64}$/.test(objeto.id)) throw new Error('id inválido')
  return `${ESFERAS[esfera]}/${pasta}/${objeto.id.slice(0, 16)}.json`
}

/** Caminhos que só existem no branch privado. */
export function ehPrivado(caminho: string): boolean {
  return (
    caminho === PASTA_IA_CHATS ||
    caminho.startsWith(`${PASTA_IA_CHATS}/`) ||
    caminho.startsWith('dados/')
  )
}

/** Qual pasta um caminho representa (ou undefined fora do layout). */
export function pastaDoCaminho(
  caminho: string,
): {esfera: Esfera; pasta: Pasta; id16: string} | undefined {
  const m =
    /^([1-7])-[a-z-]+\/(convencoes|sinapses|sinteses)\/([0-9a-f]{16})\.json$/.exec(
      caminho,
    )
  if (!m) return undefined
  const esfera = Number(m[1]) as Esfera
  if (!caminho.startsWith(`${ESFERAS[esfera]}/`)) return undefined
  return {esfera, pasta: m[2] as Pasta, id16: m[3]!}
}

// ---------- registros ----------

/** Status da procedência. Só sobe: hipótese → verificado/ensinado/confirmado. */
export type Status = 'hipótese' | 'verificado' | 'ensinado' | 'confirmado'
/** De onde veio. "aqua" = inferido do uso da rede social. */
export type Fonte =
  | 'samuel'
  | 'usuario'
  | 'wikidata'
  | 'arena'
  | 'sono'
  | 'aqua'
  | 'importacao'
  | 'edicao-manual'
  | (string & {})

/** Estado da gravidade (feed "Pra você"), em português. */
export type EstadoGravidade = 'emergente' | 'ativa' | 'enfraquecendo' | 'dormente'

interface Procedencia {
  status?: Status | (string & {})
  fonte?: Fonte
  proposta_por?: string
  criada_em: string
  atualizada_em?: string
}

export interface Convencao extends Procedencia {
  id: string
  tipo: string
  nomes: string[]
  descricao: string
  forca: number
  /** Esfera do assunto (o arquivo mora sempre na 7ª). Fatos antigos podem não ter. */
  esfera?: Esfera | null
  ancoras?: Record<string, string>
  rotulos?: Record<string, string>
  /** Opcionais novos, vindos do feed "Pra você". Não mudam o id. */
  gravidade?: number
  estado?: EstadoGravidade
}

export interface Sinapse extends Procedencia {
  id: string
  origem: string
  destino: string
  tipo: string
  contexto: string
  forca: number
  validade: string | null
  esfera: Esfera
  ancoras?: Record<string, string>
  gravidade?: number
}

export interface Sintese extends Procedencia {
  id: string
  nomes: string[]
  sinapses: string[]
  descricao: string
  forca: number
  esfera: Esfera
  absorvida_por?: string
}

/** Regra do proveniencia(): o status só sobe; hipótese pode virar forte, nunca o contrário. */
export function subirStatus(
  atual: string | undefined,
  novo: string | undefined,
): string | undefined {
  if (!novo) return atual
  if (!atual || (atual === 'hipótese' && novo !== 'hipótese')) return novo
  return atual
}

/** O "explícito × inferido" da especificação, lido do status/fonte. */
export function certeza(o: {
  status?: string
  fonte?: string
}): 'explicito' | 'verificado' | 'inferido' {
  if (o.status === 'ensinado' || o.status === 'confirmado') return 'explicito'
  if (o.status === 'verificado') return 'verificado'
  if (!o.status && (o.fonte === 'samuel' || o.fonte === 'usuario'))
    return 'explicito'
  return 'inferido'
}

const agoraIso = () => new Date().toISOString()

export function novaConvencao(c: {
  tipo: string
  nome: string
  descricao?: string
  esfera?: Esfera
  ancora?: Ancora
  status?: Status
  fonte?: Fonte
  proposta_por?: string
  agora?: string
}): Convencao {
  const out: Convencao = {
    id: c.ancora ? idConvencao({ancora: c.ancora}) : idConvencao(c),
    tipo: c.tipo,
    nomes: [c.nome],
    descricao: c.descricao ?? '',
    forca: 1,
    criada_em: c.agora ?? agoraIso(),
  }
  if (c.esfera !== undefined) out.esfera = c.esfera
  if (c.ancora) out.ancoras = {[c.ancora[0]]: c.ancora[1]}
  if (c.status) out.status = c.status
  if (c.fonte) out.fonte = c.fonte
  if (c.proposta_por) out.proposta_por = c.proposta_por
  return out
}

export function novaSinapse(s: {
  origem: string
  destino: string
  tipo: string
  contexto?: string
  validade?: string | null
  esfera?: Esfera
  status?: Status
  fonte?: Fonte
  agora?: string
}): Sinapse {
  const out: Sinapse = {
    id: idSinapse(s.origem, s.destino, s.tipo, s.contexto ?? ''),
    origem: s.origem,
    destino: s.destino,
    tipo: s.tipo,
    contexto: s.contexto ?? '',
    forca: 1,
    validade: s.validade ?? null,
    esfera: s.esfera ?? ESFERA_DE_ENTRADA,
    criada_em: s.agora ?? agoraIso(),
  }
  if (s.status) out.status = s.status
  if (s.fonte) out.fonte = s.fonte
  return out
}

/**
 * Recalcula o id de significado a partir dos campos. Para Convenções com mais
 * de um nome (outra escrita do mesmo significado), qualquer nome ou âncora vale.
 */
export function idEsperado(pasta: Pasta, o: Record<string, unknown>): string[] {
  if (pasta === 'convencoes') {
    const out: string[] = []
    for (const [f, v] of Object.entries(
      (o.ancoras ?? {}) as Record<string, string>,
    ))
      out.push(idConvencao({ancora: [f, v]}))
    for (const nome of (o.nomes ?? []) as string[])
      out.push(idConvencao({tipo: String(o.tipo), nome}))
    return out
  }
  if (pasta === 'sinapses')
    return [
      idSinapse(
        String(o.origem),
        String(o.destino),
        String(o.tipo),
        String(o.contexto ?? ''),
      ),
    ]
  return [idSintese((o.sinapses ?? []) as string[])]
}

/** Confere se o objeto está no caminho certo e se o id bate com o significado. */
export function validarObjeto(caminho: string, valor: Json): string | undefined {
  if (ehPrivado(caminho)) return undefined
  const lugar = pastaDoCaminho(caminho)
  if (!lugar) return undefined // fora do layout (manifest.json, ajustes…)
  if (!valor || typeof valor !== 'object' || Array.isArray(valor))
    return `${caminho}: não é um objeto`
  const o = valor as Record<string, Json>
  const id = String(o.id ?? '')
  if (id.slice(0, 16) !== lugar.id16) return `${caminho}: id não bate com o nome`
  if (lugar.pasta !== 'convencoes' && o.esfera !== lugar.esfera)
    return `${caminho}: esfera do objeto ≠ pasta`
  if (!idEsperado(lugar.pasta, o).includes(id))
    return `${caminho}: id não corresponde ao significado`
  return undefined
}

/** Hash de conteúdo de uma versão (o que a 616 pode ancorar). */
export const hashConteudo = (o: Json): Hash => hashOf(o)

// ---------- branch público (PDS) ----------

export const LEXICONS = {
  convencoes: 'place.aqua.semantic.convencao',
  sinapses: 'place.aqua.semantic.sinapse',
  sinteses: 'place.aqua.semantic.sintese',
} as const

/** Campos que nunca saem do cofre, mesmo de um objeto publicável. */
const SO_PRIVADO = new Set(['proposta_por'])

/**
 * Registro do PDS para um objeto publicável: rkey = id[:16], com o id completo
 * e o hash de conteúdo. IA-Chats e caminhos privados são recusados.
 */
export function paraRegistroPublico(caminho: string, valor: Json) {
  if (ehPrivado(caminho))
    throw new Error(`${caminho} é privado e não pode ir para o PDS`)
  const lugar = pastaDoCaminho(caminho)
  if (!lugar) throw new Error(`${caminho} não é Convenção, Sinapse ou Síntese`)
  const record: Record<string, Json> = {$type: LEXICONS[lugar.pasta]}
  for (const [k, v] of Object.entries(valor as Record<string, Json>))
    if (!SO_PRIVADO.has(k)) record[k] = v
  record.hashConteudo = hashConteudo(valor)
  return {collection: LEXICONS[lugar.pasta], rkey: lugar.id16, record}
}
