// Categorias sensíveis: a Aqua NÃO infere Convenções destas categorias a partir
// da atividade, a menos que o usuário ative a categoria (opt-in, uma por uma).
// Convenções que o próprio usuário adiciona continuam valendo sempre.
//
// A lista é explícita (sem "adivinhação"): uma Convenção é sensível se o nome
// normalizado (como o das #tags: sem acento, minúsculas, espaços → "-") está
// numa das listas abaixo, ou começa com um dos prefixos. Rótulos (labels do
// protocolo) contam pelo valor exato. Para trocar ou ampliar sem mexer no
// código, use SENSITIVE_CATEGORIES_FILE (JSON no mesmo formato de SENSITIVE_DEFAULTS).
import {readFileSync} from 'node:fs'

import {normalizeTag} from './extract.ts'
import {type ConventionKey, splitKey} from './model.ts'

export interface SensitiveCategory {
  id: string
  nome: string
  descricao: string
  /** nomes de tema (#tag) exatos, já normalizados ou não */
  temas: string[]
  /** começa com (ex.: "lgbt" pega "lgbtqia", "lgbt+") */
  prefixos?: string[]
  /** valores de rótulo (labels) */
  rotulos?: string[]
}

export const SENSITIVE_DEFAULTS: SensitiveCategory[] = [
  {
    id: 'saude',
    nome: 'Saúde',
    descricao: 'Doenças, saúde mental, remédios, tratamentos, gravidez.',
    temas: [
      'saude', 'saudemental', 'saude-mental', 'mentalhealth', 'health',
      'depressao', 'depression', 'ansiedade', 'anxiety', 'tdah', 'adhd',
      'autismo', 'autism', 'tea', 'bipolar', 'esquizofrenia', 'suicidio',
      'cancer', 'hiv', 'aids', 'diabetes', 'covid', 'covid19', 'terapia',
      'psiquiatria', 'remedio', 'remedios', 'medicamento', 'gravidez',
      'aborto', 'abortion', 'transtorno', 'automutilacao', 'anorexia',
      'bulimia', 'dependencia', 'alcoolismo', 'vicio', 'doenca', 'doencacronica',
    ],
  },
  {
    id: 'politica',
    nome: 'Política',
    descricao: 'Partidos, eleições, candidatos, ideologias.',
    temas: [
      'politica', 'politics', 'eleicoes', 'eleicao', 'elections', 'election',
      'lula', 'bolsonaro', 'pt', 'psol', 'pl', 'mdb', 'psdb', 'novo',
      'esquerda', 'direita', 'leftist', 'conservador', 'progressista',
      'comunismo', 'socialismo', 'anarquismo', 'fascismo', 'liberalismo',
      'democrats', 'republicans', 'trump', 'biden', 'maga', 'stf', 'congresso',
      'impeachment', 'voto',
    ],
  },
  {
    id: 'religiao',
    nome: 'Religião e crenças',
    descricao: 'Religiões, igrejas, fé, ateísmo.',
    temas: [
      'religiao', 'religion', 'fe', 'deus', 'god', 'jesus', 'cristao',
      'cristianismo', 'catolico', 'catolica', 'catolicismo', 'evangelico',
      'evangelica', 'igreja', 'biblia', 'islam', 'isla', 'muculmano',
      'judaismo', 'judeu', 'umbanda', 'candomble', 'espiritismo', 'budismo',
      'hinduismo', 'ateu', 'ateismo', 'ateismo', 'orixas', 'oracao',
    ],
  },
  {
    id: 'sexualidade',
    nome: 'Sexualidade e identidade de gênero',
    descricao: 'Orientação sexual, identidade de gênero, vida sexual.',
    temas: [
      'lgbt', 'lgbtq', 'lgbtqia', 'lgbtqia+', 'gay', 'lesbica', 'bi',
      'bissexual', 'trans', 'transgenero', 'travesti', 'naobinario',
      'nonbinary', 'queer', 'pride', 'orgulho', 'assexual', 'sexualidade',
      'sexo', 'sex',
    ],
    prefixos: ['lgbt'],
  },
  {
    id: 'adulto',
    nome: 'Conteúdo adulto (+18)',
    descricao: 'Nudez e conteúdo sexual, inclusive os rótulos +18 do protocolo.',
    temas: ['nsfw', 'porn', 'porno', 'nude', 'nudes', 'nudez', 'onlyfans', '18+', 'adulto', 'hentai'],
    rotulos: ['porn', 'sexual', 'nudity', 'sexual-figurative', 'graphic-media', 'gore'],
  },
  {
    id: 'etnia-raca',
    nome: 'Origem étnica e raça',
    descricao: 'Raça, etnia, origem, povos.',
    temas: [
      'raca', 'race', 'etnia', 'racismo', 'racism', 'negro', 'negra',
      'negritude', 'blacklivesmatter', 'blm', 'indigena', 'indigenas',
      'quilombola', 'antirracismo', 'imigrante', 'imigracao', 'refugiado',
    ],
  },
  {
    id: 'sindicato',
    nome: 'Filiação sindical',
    descricao: 'Sindicatos, greves, centrais sindicais.',
    temas: ['sindicato', 'sindicatos', 'sindical', 'greve', 'union', 'unions', 'cut', 'forcasindical'],
  },
  {
    id: 'financas-pessoais',
    nome: 'Finanças pessoais (dívidas e crédito)',
    descricao: 'Só o que é claramente sensível: dívidas, nome sujo, falência, empréstimos.',
    temas: [
      'divida', 'dividas', 'endividado', 'nomesujo', 'serasa', 'spc',
      'falencia', 'emprestimo', 'agiota', 'inadimplente', 'cheque-especial',
      'superendividamento',
    ],
  },
]

export interface SensitiveIndex {
  categories: SensitiveCategory[]
  categoryOf(key: ConventionKey): string | undefined
}

export function createSensitiveIndex(
  categories: SensitiveCategory[] = SENSITIVE_DEFAULTS,
): SensitiveIndex {
  const temas = new Map<string, string>()
  const rotulos = new Map<string, string>()
  const prefixos: Array<[string, string]> = []
  for (const c of categories) {
    for (const t of c.temas) temas.set(normalizeTag(t), c.id)
    for (const r of c.rotulos ?? []) rotulos.set(normalizeTag(r), c.id)
    for (const p of c.prefixos ?? []) prefixos.push([normalizeTag(p), c.id])
  }
  return {
    categories,
    categoryOf(key) {
      let p: {tipo: string; nome: string}
      try {
        p = splitKey(key)
      } catch {
        return undefined
      }
      const nome = normalizeTag(p.nome)
      if (p.tipo === 'rotulo') return rotulos.get(nome) ?? temas.get(nome)
      if (p.tipo !== 'tema') return undefined
      return temas.get(nome) ?? prefixos.find(([x]) => nome.startsWith(x))?.[1]
    },
  }
}

/** Lê SENSITIVE_CATEGORIES_FILE (se houver) ou usa a lista padrão. */
export function loadSensitiveCategories(file?: string): SensitiveCategory[] {
  if (!file) return SENSITIVE_DEFAULTS
  const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
  if (!Array.isArray(raw)) throw new Error(`${file}: esperado um array de categorias`)
  for (const c of raw as SensitiveCategory[])
    if (!c?.id || !c.nome || !Array.isArray(c.temas))
      throw new Error(`${file}: categoria inválida (id, nome, temas)`)
  return raw as SensitiveCategory[]
}

export const SENSITIVE_KEY_PREFIX = 'sensivel:'
