import {type Did, type MonetizationEntry, type WalletSummary} from './types'
export function summarizeLedger(
  ownerDid: Did,
  currency: string,
  entries: MonetizationEntry[],
): WalletSummary {
  const summary: WalletSummary = {
    ownerDid,
    currency,
    pending: 0,
    available: 0,
    paid: 0,
  }
  for (const entry of entries) {
    if (entry.ownerDid !== ownerDid || entry.currency !== currency) continue
    if (
      ![entry.gross, entry.fees, entry.net].every(
        n => Number.isSafeInteger(n) && n >= 0,
      ) ||
      entry.gross - entry.fees !== entry.net
    )
      throw new Error('Lançamento monetário inválido')
    if (entry.status !== 'refunded') {
      summary[entry.status] += entry.net
      if (!Number.isSafeInteger(summary[entry.status]))
        throw new Error('Saldo excede limite inteiro')
    }
  }
  return summary
}
