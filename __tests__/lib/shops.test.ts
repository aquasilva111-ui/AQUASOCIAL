import {
  brl,
  canTransition,
  formatMoney,
  newShopRecord,
  productPath,
  splitPayment,
} from '#/lib/shops/model'

describe('shops model', () => {
  it('formats BRL cents', () => {
    expect(formatMoney(brl(0))).toBe('R$ 0,00')
    expect(formatMoney(brl(5))).toBe('R$ 0,05')
    expect(formatMoney(brl(123456))).toBe('R$ 1.234,56')
  })

  it('rejects non-integer or negative money', () => {
    expect(() => brl(1.5)).toThrow()
    expect(() => brl(-1)).toThrow()
  })

  it('creates a trimmed shop record', () => {
    const shop = newShopRecord(
      '  Loja Aqua  ',
      new Date('2026-10-02T00:00:00Z'),
    )
    expect(shop.name).toBe('Loja Aqua')
    expect(shop.status).toBe('active')
    expect(() => newShopRecord('   ')).toThrow()
  })

  it('builds a product path', () => {
    expect(productPath({shopDid: 'did:plc:abc', productId: 'p 1'})).toBe(
      '/shops/did:plc:abc/products/p%201',
    )
  })

  it('only allows valid order transitions', () => {
    expect(canTransition('pending_payment', 'paid')).toBe(true)
    expect(canTransition('paid', 'delivered')).toBe(false)
    expect(canTransition('refunded', 'paid')).toBe(false)
  })

  it('splits payment without losing cents', () => {
    const {fee, seller} = splitPayment(brl(999), 1000)
    expect(fee.amount).toBe(99)
    expect(seller.amount).toBe(900)
    expect(fee.amount + seller.amount).toBe(999)
    expect(() => splitPayment(brl(100), 10001)).toThrow()
  })
})
