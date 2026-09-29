/**
 * Money is an integer count of the currency's minor unit, held as bigint.
 * Floating point never touches an amount (19.90 BRL is 1990n).
 */

/** ISO 4217 currencies accepted, with their minor-unit exponent. */
export const CURRENCIES: Record<string, number> = {
  BRL: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
}

export class MoneyError extends Error {}

export function assertCurrency(currency: string): string {
  if (!(currency in CURRENCIES))
    throw new MoneyError(`Unsupported currency: ${currency}`)
  return currency
}

/** Accepts integer minor units only (number or numeric string). */
export function parseMinor(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value))
      throw new MoneyError('Amount must be an integer in minor units.')
    return BigInt(value)
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value)
  throw new MoneyError('Amount must be an integer in minor units.')
}

/** amount * bps / 10000, rounded half up, integer only. */
export function applyBps(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000)
    throw new MoneyError('Basis points must be an integer between 0 and 10000.')
  return (amount * BigInt(bps) + 5000n) / 10000n
}

/** Proportional share (e.g. fee reversal for a partial refund), half up. */
export function proportional(part: bigint, whole: bigint, of: bigint): bigint {
  if (whole === 0n) return 0n
  return (part * of + whole / 2n) / whole
}
