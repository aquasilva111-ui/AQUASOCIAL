const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Centavos inteiros → "R$ 1.234,56". */
export const formatMoney = (cents: number): string => brl.format(cents / 100);

export const isOnSale = (priceCents: number, compareAtCents?: number): boolean => !!compareAtCents && compareAtCents > priceCents;

export const discountPercent = (priceCents: number, compareAtCents?: number): number =>
  isOnSale(priceCents, compareAtCents) ? Math.round(((compareAtCents! - priceCents) / compareAtCents!) * 100) : 0;
