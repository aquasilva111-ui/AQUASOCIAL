// Divisão do valor de um carrinho entre a Aqua Shops (comissão) e os vendedores.
// Tudo em centavos inteiros; a soma sempre fecha com o total.

export interface SellerGross {
  sellerId: string;
  grossCents: number;
}

export interface SplitConfig {
  /** Comissão em pontos-base (1000 = 10%). */
  commissionBps: number;
  /**
   * Comissão mínima do carrinho. Precisa cobrir a taxa do provedor de pagamento, senão
   * o Asaas recusa o split (a taxa sai da parte da plataforma).
   */
  minCommissionCents: number;
}

export interface SellerShare {
  sellerId: string;
  grossCents: number;
  commissionCents: number;
  payoutCents: number;
}

export interface SplitResult {
  totalCents: number;
  commissionCents: number;
  sellers: SellerShare[];
}

export function computeSplit(lines: SellerGross[], cfg: SplitConfig): SplitResult {
  if (!Number.isInteger(cfg.commissionBps) || cfg.commissionBps < 0 || cfg.commissionBps > 10000) {
    throw new Error('commissionBps deve ser um inteiro entre 0 e 10000');
  }
  if (!Number.isInteger(cfg.minCommissionCents) || cfg.minCommissionCents < 0) {
    throw new Error('minCommissionCents deve ser um inteiro não negativo');
  }

  // Junta linhas do mesmo vendedor.
  const gross = new Map<string, number>();
  for (const l of lines) {
    if (!Number.isInteger(l.grossCents) || l.grossCents <= 0) throw new Error('Valor por vendedor inválido');
    gross.set(l.sellerId, (gross.get(l.sellerId) ?? 0) + l.grossCents);
  }
  const entries = [...gross.entries()];
  const totalCents = entries.reduce((sum, [, g]) => sum + g, 0);
  if (!totalCents) throw new Error('Carrinho vazio');

  const commissionCents = Math.min(Math.max(Math.floor((totalCents * cfg.commissionBps) / 10000), cfg.minCommissionCents), totalCents);

  // Reparte a comissão proporcionalmente; os centavos que sobram vão para os maiores restos.
  const parts = entries.map(([sellerId, g]) => {
    const exact = (g * commissionCents) / totalCents;
    return { sellerId, g, base: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = commissionCents - parts.reduce((sum, p) => sum + p.base, 0);
  for (const p of [...parts].sort((a, b) => b.rest - a.rest || a.sellerId.localeCompare(b.sellerId))) {
    if (left <= 0) break;
    p.base += 1;
    left -= 1;
  }

  return {
    totalCents,
    commissionCents,
    sellers: parts.map(p => ({ sellerId: p.sellerId, grossCents: p.g, commissionCents: p.base, payoutCents: p.g - p.base })),
  };
}
