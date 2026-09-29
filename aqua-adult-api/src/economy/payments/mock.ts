import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto'

import {type Config} from '../../config.js'
import {
  type CheckoutInput,
  type CheckoutResult,
  type PaymentEvent,
  type PaymentEventType,
  type PaymentProvider,
  WebhookVerificationError,
} from './provider.js'

const SIGNATURE_HEADER = 'x-mock-signature'
const TOLERANCE_SECONDS = 300

/**
 * DEVELOPMENT-ONLY payment provider. It moves no money. It exists so the
 * whole Order → Payment → Entitlement pipeline can be exercised, including
 * signed webhooks, retries, refunds and chargebacks.
 *
 * Cannot be constructed in production — the process refuses to start.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock'
  private payments = new Map<
    string,
    {amount: bigint; currency: string; status: string}
  >()

  constructor(private config: Config) {
    if (config.env === 'production' || !config.mockPayments) {
      throw new Error('MockPaymentProvider is disabled in this environment.')
    }
  }

  async createCheckout(
    input: CheckoutInput,
    prefix = 'mock_pay_',
  ): Promise<CheckoutResult> {
    const providerReference = `${prefix}${randomBytes(9).toString('base64url')}`
    this.payments.set(providerReference, {
      amount: input.amountMinor,
      currency: input.currency,
      status: 'pending',
    })
    return {
      providerReference,
      checkoutUrl: `/dev/mock-checkout/${providerReference}`,
    }
  }

  async createSubscription(
    input: CheckoutInput & {billingPeriod: 'month' | 'year'},
  ): Promise<CheckoutResult> {
    return this.createCheckout(input, 'mock_sub_')
  }

  async getPaymentStatus(ref: string) {
    const status = this.payments.get(ref)?.status
    return (status ?? 'unknown') as
      'pending' | 'succeeded' | 'failed' | 'refunded' | 'unknown'
  }

  async refund(ref: string) {
    const p = this.payments.get(ref)
    if (p) p.status = 'refunded'
    return {refundReference: `mock_ref_${randomBytes(6).toString('base64url')}`}
  }

  async cancel(ref: string) {
    const p = this.payments.get(ref)
    if (p) p.status = 'cancelled'
  }

  async cancelSubscription() {}

  /** Builds a signed webhook exactly as a real provider would deliver it. */
  signEvent(event: {
    id?: string
    type: PaymentEventType
    providerReference: string
    amountMinor?: bigint
    currency?: string
    timestamp?: number
  }): {rawBody: string; headers: Record<string, string>} {
    const body = JSON.stringify({
      id: event.id ?? `evt_${randomBytes(9).toString('base64url')}`,
      type: event.type,
      providerReference: event.providerReference,
      amountMinor: event.amountMinor?.toString(),
      currency: event.currency,
      occurredAt: new Date().toISOString(),
    })
    const t = event.timestamp ?? Math.floor(Date.now() / 1000)
    const sig = createHmac('sha256', this.config.mockWebhookSecret)
      .update(`${t}.${body}`)
      .digest('hex')
    return {rawBody: body, headers: {[SIGNATURE_HEADER]: `t=${t},v1=${sig}`}}
  }

  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): PaymentEvent {
    const header = headers[SIGNATURE_HEADER]
    if (typeof header !== 'string')
      throw new WebhookVerificationError('missing signature')
    const parts = Object.fromEntries(
      header.split(',').map(p => p.split('=', 2)),
    )
    const t = Number(parts.t)
    if (!Number.isInteger(t) || !parts.v1)
      throw new WebhookVerificationError('bad signature')
    if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS)
      throw new WebhookVerificationError('stale event')
    const expected = createHmac('sha256', this.config.mockWebhookSecret)
      .update(`${t}.${rawBody}`)
      .digest()
    const given = Buffer.from(String(parts.v1), 'hex')
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      throw new WebhookVerificationError('bad signature')
    const data = JSON.parse(rawBody)
    const ref = this.payments.get(data.providerReference)
    if (ref && data.type === 'payment.succeeded') ref.status = 'succeeded'
    if (ref && data.type === 'payment.failed') ref.status = 'failed'
    return {
      id: String(data.id),
      type: data.type,
      providerReference: String(data.providerReference),
      amountMinor:
        data.amountMinor != null ? BigInt(data.amountMinor) : undefined,
      currency: data.currency,
      occurredAt: String(data.occurredAt),
    }
  }
}
