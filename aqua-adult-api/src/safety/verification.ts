import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto'

import {type Config} from '../config.js'

/**
 * Age assurance / identity verification providers. AQUA never receives or
 * stores identity documents: the provider does the check and sends back a
 * signed result with only what is needed — outcome, its own reference, when
 * it happened and (for age) how long it stays valid.
 *
 * No real provider is chosen yet. MockVerificationProvider exists for
 * development and tests only and cannot be built in production.
 */

export type VerificationKind = 'age' | 'identity'

export type VerificationResult = {
  /** Provider event id — webhook idempotency key. */
  eventId: string
  kind: VerificationKind
  did: string
  verified: boolean
  reference: string
  verifiedAt: string
  expiresAt?: string
}

export class VerificationWebhookError extends Error {}

export interface VerificationProvider {
  readonly name: string
  /** Throws VerificationWebhookError unless signature and freshness check out. */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): VerificationResult
}

const SIGNATURE_HEADER = 'x-mock-verification-signature'
const TOLERANCE_SECONDS = 300

export class MockVerificationProvider implements VerificationProvider {
  readonly name = 'mock-verification'

  constructor(private config: Config) {
    if (config.env === 'production' || !config.mockPayments)
      throw new Error(
        'MockVerificationProvider is disabled in this environment.',
      )
  }

  private sign(body: string, ts: number) {
    return createHmac('sha256', this.config.mockWebhookSecret)
      .update(`${ts}.${body}`)
      .digest('hex')
  }

  /** Builds a signed result as the provider would POST it. */
  signResult(
    input: Omit<VerificationResult, 'eventId' | 'verifiedAt'> & {
      verifiedAt?: string
    },
    now = Date.now(),
  ) {
    const result: VerificationResult = {
      eventId: `mockv_${randomBytes(9).toString('base64url')}`,
      verifiedAt: new Date(now).toISOString(),
      ...input,
    }
    const rawBody = JSON.stringify(result)
    const ts = Math.floor(now / 1000)
    return {
      rawBody,
      headers: {[SIGNATURE_HEADER]: `t=${ts},v1=${this.sign(rawBody, ts)}`},
    }
  }

  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): VerificationResult {
    const header = headers[SIGNATURE_HEADER]
    const m =
      typeof header === 'string'
        ? header.match(/^t=(\d+),v1=([0-9a-f]{64})$/)
        : null
    if (!m) throw new VerificationWebhookError('missing signature')
    const ts = Number(m[1])
    if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS)
      throw new VerificationWebhookError('stale')
    const expected = Buffer.from(this.sign(rawBody, ts), 'hex')
    const given = Buffer.from(m[2], 'hex')
    if (expected.length !== given.length || !timingSafeEqual(expected, given))
      throw new VerificationWebhookError('bad signature')
    const r = JSON.parse(rawBody) as VerificationResult
    if (
      !r.eventId ||
      !['age', 'identity'].includes(r.kind) ||
      !/^did:(plc|web):/.test(r.did) ||
      typeof r.verified !== 'boolean' ||
      !r.reference
    )
      throw new VerificationWebhookError('malformed')
    return r
  }
}
