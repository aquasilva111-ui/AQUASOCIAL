// Identidade e versões das Convenções, reconstruídas a partir dos testes do
// feed-generator perdido (AQUASOCIAL b574e6abc) e alinhadas à Base de Sínteses:
// uma chave "tipo:nome" (ex.: "tema:musica") é a Convenção {tipo, nomes:[nome]}
// e o id é o MESMO id de significado da U.I. (gerar_id do repositorio.py).
import {
  canonical as canonicalCore,
  type EstadoGravidade,
  hashOf,
  idConvencao,
} from 'aqua-personal-git'

export type ConventionKey = string

/** JSON canônico (chaves ordenadas, NFC): mesmo texto para o mesmo conteúdo. */
export const canonical = (v: unknown): string => canonicalCore(v)

/** "tema:musica" → {tipo:"tema", nome:"musica"} (o nome pode ter ":", ex. DIDs). */
export function splitKey(key: ConventionKey): {tipo: string; nome: string} {
  const i = key.indexOf(':')
  if (i <= 0 || i === key.length - 1)
    throw new Error(`chave de Convenção inválida: ${key}`)
  return {tipo: key.slice(0, i), nome: key.slice(i + 1)}
}

/** Mesmo id para a mesma chave, em qualquer servidor ou U.I. (sha256 hex). */
export function conventionId(key: ConventionKey): string {
  return idConvencao(splitKey(key))
}

export type GravityState = 'emerging' | 'active' | 'weakening' | 'dormant'

export const ESTADO_PT: Record<GravityState, EstadoGravidade> = {
  emerging: 'emergente',
  active: 'ativa',
  weakening: 'enfraquecendo',
  dormant: 'dormente',
}

/**
 * Versão encadeada de uma Convenção: hash de conteúdo do (id, versão, estado,
 * versão anterior). É o que pode ser provado na 616 sem revelar o resto.
 */
export function versionHash(
  key: ConventionKey,
  version: number,
  state: GravityState | EstadoGravidade,
  parent: string | null,
): string {
  return hashOf({
    convencao: conventionId(key),
    versao: version,
    estado: state,
    anterior: parent,
  })
}
