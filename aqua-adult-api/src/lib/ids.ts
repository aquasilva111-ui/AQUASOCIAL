import {randomBytes} from 'node:crypto'

/** Opaque, unguessable ids. Never sequential, so ids alone reveal nothing. */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`
}
