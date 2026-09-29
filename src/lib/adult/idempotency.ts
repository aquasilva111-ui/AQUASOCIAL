import {TID} from '@atproto/common-web'

/** One key per purchase attempt; retries of the same attempt reuse it. */
export function newIdempotencyKey() {
  return `${TID.nextStr()}-${Math.random().toString(36).slice(2, 12)}`
}
