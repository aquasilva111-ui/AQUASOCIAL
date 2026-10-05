import type { MercurOffer, MercurProduct } from '../src/mercur.ts';

const stock = (qty: number) => [{ required_quantity: 1, inventory_item: { location_levels: [{ stocked_quantity: qty }] } }];
const price = (amount: number, original = amount) => ({ calculated_amount: amount, original_amount: original, currency_code: 'brl' });

export const products: MercurProduct[] = [
  {
    id: 'prod_slides',
    title: 'Strive Mule Slides',
    description: 'Chinelo.',
    thumbnail: 'https://cdn.example/slides-thumb.png',
    images: [
      { url: 'https://cdn.example/slides-2.png', rank: 1 },
      { url: 'https://cdn.example/slides-1.png', rank: 0 },
    ],
    categories: [
      { id: 'pcat_sandals', name: 'Sandals', category_children: [{}] },
      { id: 'pcat_slides', name: 'Slides', category_children: [] },
    ],
  },
  { id: 'prod_boot', title: 'Trail Boot', description: null, thumbnail: 'https://cdn.example/boot.png', metadata: { condition: 'used' }, categories: [{ id: 'pcat_boots', name: 'Boots' }] },
  { id: 'prod_ghost', title: 'Sem oferta', description: '', thumbnail: null, categories: [] },
];

const kickz = { id: 'sel_kickz', name: 'Kickz Corner', handle: 'kickz-corner' };
const sole = { id: 'sel_sole', name: 'Sole Society', handle: 'sole-society', metadata: { did: 'did:plc:sole' } };

export const offers: MercurOffer[] = [
  // Kickz vende duas variantes do mesmo produto: vira um anúncio só.
  { id: 'o1', seller_id: 'sel_kickz', product_id: 'prod_slides', variant_id: 'v40', created_at: '2026-10-01T10:00:00Z', seller: kickz, inventory_item_link: stock(3), calculated_price: price(714, 900) },
  { id: 'o2', seller_id: 'sel_kickz', product_id: 'prod_slides', variant_id: 'v43', created_at: '2026-10-01T09:00:00Z', seller: kickz, inventory_item_link: stock(4), calculated_price: price(600) },
  { id: 'o3', seller_id: 'sel_sole', product_id: 'prod_slides', variant_id: 'v43', created_at: '2026-10-02T09:00:00Z', seller: sole, inventory_item_link: stock(2_000_000), calculated_price: price(552) },
  { id: 'o4', seller_id: 'sel_sole', product_id: 'prod_boot', variant_id: 'b1', created_at: '2026-09-30T09:00:00Z', seller: sole, inventory_item_link: stock(0), calculated_price: price(1000) },
  // Sem preço calculado (moeda sem preço): não pode aparecer.
  { id: 'o5', seller_id: 'sel_kickz', product_id: 'prod_boot', variant_id: 'b2', created_at: '2026-09-29T09:00:00Z', seller: kickz, inventory_item_link: stock(5), calculated_price: { calculated_amount: null, original_amount: null, currency_code: null } },
];
