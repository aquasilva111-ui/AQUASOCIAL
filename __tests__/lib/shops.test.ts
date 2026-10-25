import {
  brl,
  canReview,
  canTransition,
  formatMoney,
  groupByShop,
  linesTotal,
  newProductRecord,
  newReviewRecord,
  newShopRecord,
  type OrderStatus,
  productPath,
  productUri,
  type ShopOrder,
} from '#/lib/shops/model'

const blob = {
  $type: 'blob' as const,
  ref: {$link: 'bafkreiabc'},
  mimeType: 'image/jpeg',
  size: 1234,
}

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
    expect(shop.$type).toBe('place.aqua.shop.shop')
    expect(shop.name).toBe('Loja Aqua')
    expect(shop.status).toBe('active')
    expect(() => newShopRecord('   ')).toThrow()
  })

  it('builds a product path and AT-URI', () => {
    const ref = {shopDid: 'did:plc:abc', productId: 'p 1'}
    expect(productPath(ref)).toBe('/shops/did:plc:abc/products/p%201')
    expect(productUri({shopDid: 'did:plc:abc', productId: '3k2a'})).toBe(
      'at://did:plc:abc/place.aqua.shop.product/3k2a',
    )
  })
})

describe('product record', () => {
  const variant = {id: 'v1', name: 'P', price: brl(9990)}

  it('creates a product with variants, prices in cents and media', () => {
    const p = newProductRecord(
      {
        name: '  Camiseta  ',
        description: '  Algodão  ',
        media: [{image: blob, alt: 'frente'}],
        variants: [variant, {...variant, id: 'v2', name: 'M'}],
      },
      new Date('2026-10-02T00:00:00Z'),
    )
    expect(p.$type).toBe('place.aqua.shop.product')
    expect(p.name).toBe('Camiseta')
    expect(p.description).toBe('Algodão')
    expect(p.status).toBe('active')
    expect(p.condition).toBe('new')
    expect(p.variants.map(v => v.price.amount)).toEqual([9990, 9990])
    expect(p.media).toHaveLength(1)
  })

  it('requires a name and at least one variant', () => {
    expect(() => newProductRecord({name: ' ', variants: [variant]})).toThrow()
    expect(() => newProductRecord({name: 'X', variants: []})).toThrow()
  })

  it('rejects duplicate variant ids and invalid prices', () => {
    expect(() =>
      newProductRecord({name: 'X', variants: [variant, variant]}),
    ).toThrow()
    expect(() =>
      newProductRecord({
        name: 'X',
        variants: [{...variant, price: {amount: 10.5, currency: 'BRL'}}],
      }),
    ).toThrow()
  })
})

describe('review record', () => {
  const ref = {shopDid: 'did:plc:shop', productId: '3k2a'}

  it('points at the product and validates the rating', () => {
    const r = newReviewRecord(
      {subject: ref, rating: 5, text: '  Ótimo  '},
      new Date('2026-10-02T00:00:00Z'),
    )
    expect(r.$type).toBe('place.aqua.shop.review')
    expect(r.subject).toBe('at://did:plc:shop/place.aqua.shop.product/3k2a')
    expect(r.text).toBe('Ótimo')
    expect(() => newReviewRecord({subject: ref, rating: 0})).toThrow()
    expect(() => newReviewRecord({subject: ref, rating: 6})).toThrow()
    expect(() => newReviewRecord({subject: ref, rating: 4.5})).toThrow()
  })

  it('only lets a verified buyer review: own, delivered order with the product', () => {
    const order: ShopOrder = {
      id: 'ord_1',
      shopDid: 'did:plc:shop',
      buyerDid: 'did:plc:buyer',
      status: 'delivered',
      lines: [
        {
          productId: '3k2a',
          variantId: 'v1',
          title: 'Camiseta',
          quantity: 1,
          unitPrice: brl(9990),
        },
      ],
      shipping: brl(1000),
      total: brl(10990),
      payment: {provider: 'asaas', chargeId: 'pay_1'},
      createdAt: '2026-10-02T00:00:00Z',
    }
    expect(canReview(order, 'did:plc:buyer', ref)).toBe(true)
    expect(canReview(order, 'did:plc:other', ref)).toBe(false)
    expect(canReview(order, 'did:plc:buyer', {...ref, productId: 'x'})).toBe(
      false,
    )
    expect(
      canReview(order, 'did:plc:buyer', {...ref, shopDid: 'did:plc:other'}),
    ).toBe(false)
    expect(canReview({...order, status: 'paid'}, 'did:plc:buyer', ref)).toBe(
      false,
    )
  })
})

describe('order lifecycle', () => {
  it('only allows valid transitions', () => {
    expect(canTransition('awaiting_payment', 'paid', 'provider')).toBe(true)
    expect(canTransition('paid', 'delivered', 'merchant')).toBe(false)
    expect(canTransition('refunded', 'paid', 'provider')).toBe(false)
    expect(canTransition('cancelled', 'paid', 'provider')).toBe(false)
  })

  it('lets the merchant ship and deliver, never pay or refund', () => {
    expect(canTransition('paid', 'shipped', 'merchant')).toBe(true)
    expect(canTransition('shipped', 'delivered', 'merchant')).toBe(true)
    expect(canTransition('awaiting_payment', 'paid', 'merchant')).toBe(false)
    expect(canTransition('shipped', 'refunded', 'merchant')).toBe(false)
  })

  it('reflects refunds only from the provider', () => {
    const refundable: OrderStatus[] = ['paid', 'shipped', 'delivered']
    for (const from of refundable) {
      expect(canTransition(from, 'refunded', 'provider')).toBe(true)
      expect(canTransition(from, 'refunded', 'merchant')).toBe(false)
    }
    expect(canTransition('awaiting_payment', 'refunded', 'provider')).toBe(
      false,
    )
  })
})

describe('cart by shop', () => {
  const line = (shopDid: string, productId: string, quantity = 1) => ({
    shopDid,
    productId,
    variantId: 'v1',
    title: productId,
    quantity,
    unitPrice: brl(1000),
  })

  it('groups lines per shop: one order (and one charge) each', () => {
    const groups = groupByShop([
      line('did:plc:a', 'p1'),
      line('did:plc:b', 'p2'),
      line('did:plc:a', 'p3'),
    ])
    expect([...groups.keys()]).toEqual(['did:plc:a', 'did:plc:b'])
    expect(groups.get('did:plc:a')?.map(l => l.productId)).toEqual(['p1', 'p3'])
  })

  it('sums a shop order in cents', () => {
    expect(
      linesTotal([line('did:plc:a', 'p1', 2), line('did:plc:a', 'p2', 3)])
        .amount,
    ).toBe(5000)
    expect(() => linesTotal([line('did:plc:a', 'p1', 0)])).toThrow()
  })
})
