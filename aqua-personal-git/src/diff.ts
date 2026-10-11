// Diff semântico campo a campo: "activation 0.42 → 0.71".
import {canonical, type Json} from './canonical.ts'

export interface FieldChange {
  /** Caminho do campo, ex.: "activation" ou "contexts.work.weight". */
  field: string
  before?: Json
  after?: Json
}

const isObj = (v: unknown): v is Record<string, Json> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

export function diffFields(
  before: Json | undefined,
  after: Json | undefined,
  prefix = '',
): FieldChange[] {
  if (isObj(before) && isObj(after)) {
    const keys = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].sort()
    return keys.flatMap(k =>
      diffFields(before[k], after[k], prefix ? `${prefix}.${k}` : k),
    )
  }
  const same =
    before === undefined || after === undefined
      ? before === after
      : canonical(before) === canonical(after)
  if (same) return []
  const out: FieldChange = {field: prefix || '.'}
  if (before !== undefined) out.before = before
  if (after !== undefined) out.after = after
  return [out]
}
