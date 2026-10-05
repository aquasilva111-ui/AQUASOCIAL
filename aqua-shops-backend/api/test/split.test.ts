import { describe, expect, it } from 'vitest';
import { computeSplit } from '../src/split.ts';

const cfg = { commissionBps: 1000, minCommissionCents: 200 };

describe('computeSplit', () => {
  it('cobra a comissão e repassa o resto ao vendedor', () => {
    const r = computeSplit([{ sellerId: 'a', grossCents: 10000 }], cfg);
    expect(r.commissionCents).toBe(1000);
    expect(r.sellers).toEqual([{ sellerId: 'a', grossCents: 10000, commissionCents: 1000, payoutCents: 9000 }]);
  });

  it('aplica a comissão mínima em carrinhos baratos', () => {
    const r = computeSplit([{ sellerId: 'a', grossCents: 500 }], cfg);
    expect(r.commissionCents).toBe(200);
    expect(r.sellers[0]!.payoutCents).toBe(300);
  });

  it('nunca cobra mais que o total', () => {
    const r = computeSplit([{ sellerId: 'a', grossCents: 150 }], cfg);
    expect(r.commissionCents).toBe(150);
    expect(r.sellers[0]!.payoutCents).toBe(0);
  });

  it('junta linhas do mesmo vendedor e a soma sempre fecha', () => {
    const r = computeSplit(
      [
        { sellerId: 'a', grossCents: 3333 },
        { sellerId: 'b', grossCents: 3333 },
        { sellerId: 'a', grossCents: 1 },
        { sellerId: 'c', grossCents: 3333 },
      ],
      { commissionBps: 1250, minCommissionCents: 0 },
    );
    expect(r.sellers).toHaveLength(3);
    expect(r.sellers.reduce((s, x) => s + x.commissionCents, 0)).toBe(r.commissionCents);
    expect(r.sellers.reduce((s, x) => s + x.payoutCents, 0) + r.commissionCents).toBe(r.totalCents);
    expect(r.sellers.every(s => s.payoutCents >= 0 && Number.isInteger(s.commissionCents))).toBe(true);
  });

  it('rejeita entradas inválidas', () => {
    expect(() => computeSplit([], cfg)).toThrow();
    expect(() => computeSplit([{ sellerId: 'a', grossCents: 1.5 }], cfg)).toThrow();
    expect(() => computeSplit([{ sellerId: 'a', grossCents: 100 }], { ...cfg, commissionBps: 10001 })).toThrow();
  });
});
