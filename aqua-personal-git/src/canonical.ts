// JSON canônico + SHA-256: o mesmo conteúdo dá sempre o mesmo hash, em
// qualquer máquina e com qualquer ordem de chaves.
import {createHash} from 'node:crypto'

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | {[k: string]: Json}

/**
 * Serialização canônica (subconjunto do RFC 8785): chaves em ordem, sem
 * espaços, `undefined` some de objetos. Recusa o que não tem forma única
 * (NaN, Infinity, Date, Map, classes).
 */
export function canonical(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('número não finito')
      return JSON.stringify(Object.is(value, -0) ? 0 : value)
    case 'string':
      return JSON.stringify(value.normalize('NFC'))
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
      const proto = Object.getPrototypeOf(value)
      if (proto !== Object.prototype && proto !== null)
        throw new TypeError('só objetos simples')
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      return `{${entries.map(([k, v]) => `${JSON.stringify(k.normalize('NFC'))}:${canonical(v)}`).join(',')}}`
    }
    default:
      throw new TypeError(`tipo não serializável: ${typeof value}`)
  }
}

export type Hash = `sha256:${string}`

export function hashOf(value: unknown): Hash {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`
}
