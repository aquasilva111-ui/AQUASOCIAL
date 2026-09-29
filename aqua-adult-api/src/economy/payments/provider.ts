/**
 * Payment provider abstraction. AQUA never talks to a gateway directly and
 * never sees card numbers, CVV or financial credentials — the provider's
 * hosted checkout collects them. A payment only becomes access after the
 * backend verifies a signed provider event (never a frontend "success").
 */

export type PaymentEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'refund.succeeded'
  | 'dispute.created'
  | 'dispute.won'
  | 'chargeback.created'
  | 'subscription.renewed'
  | 'subscription.payment_failed'
  | 'subscription.cancelled'

export type PaymentEvent = {
  /** Provider's event id — the idempotency key for webhook processing. */
  id: string
  type: PaymentEventType
  /** Checkout/payment reference, or the subscription reference for renewals. */
  providerReference: string
  amountMinor?: bigint
  currency?: string
  occurredAt: string
}

export type CheckoutInput = {
  orderId: string
  amountMinor: bigint
  currency: string
  /** Neutral, non-explicit description (shows on statements/receipts). */
  description: string
}

export type CheckoutResult = {providerReference: string; checkoutUrl: string}

export class WebhookVerificationError extends Error {}

export interface PaymentProvider {
  readonly name: string
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>
  getPaymentStatus(
    providerReference: string,
  ): Promise<'pending' | 'succeeded' | 'failed' | 'refunded' | 'unknown'>
  /** Throws WebhookVerificationError unless signature and freshness check out. */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): PaymentEvent
  refund(
    providerReference: string,
    amountMinor: bigint,
  ): Promise<{refundReference: string}>
  cancel(providerReference: string): Promise<void>
  createSubscription(
    input: CheckoutInput & {billingPeriod: 'month' | 'year'},
  ): Promise<CheckoutResult>
  cancelSubscription(
    providerReference: string,
    opts: {atPeriodEnd: boolean},
  ): Promise<void>
}
