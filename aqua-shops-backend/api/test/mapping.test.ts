import { describe, expect, it } from 'vitest';
import { listingId, queryListings, toCategories, toListings } from '../src/mapping.ts';
import { offers, products } from './fixtures.ts';

const listings = toListings(offers, products);
const find = (id: string) => listings.find(l => l.id === id)!;

describe('toListings', () => {
  it('agrupa por produto × vendedor e ignora produtos/ofertas sem preço', () => {
    expect(listings.map(l => l.id).sort()).toEqual([listingId('prod_boot', 'sel_sole'), listingId('prod_slides', 'sel_kickz'), listingId('prod_slides', 'sel_sole')].sort());
  });

  it('usa a oferta mais barata, em centavos, e soma o estoque', () => {
    const l = find(listingId('prod_slides', 'sel_kickz'));
    expect(l.priceCents).toBe(60000);
    expect(l.stock).toBe(7);
    expect(l.compareAtCents).toBeUndefined(); // a mais barata não está em oferta
  });

  it('só marca oferta quando o preço original é maior', () => {
    const only = toListings([offers[0]!], products);
    expect(only[0]!.priceCents).toBe(71400);
    expect(only[0]!.compareAtCents).toBe(90000);
  });

  it('limita o estoque exibido', () => {
    expect(find(listingId('prod_slides', 'sel_sole')).stock).toBe(999);
  });

  it('ordena imagens por rank e cai para a miniatura', () => {
    expect(find(listingId('prod_slides', 'sel_kickz')).images).toEqual(['https://cdn.example/slides-1.png', 'https://cdn.example/slides-2.png']);
    expect(find(listingId('prod_boot', 'sel_sole')).images).toEqual(['https://cdn.example/boot.png']);
  });

  it('escolhe a categoria mais específica e lê a condição do metadata', () => {
    expect(find(listingId('prod_slides', 'sel_kickz')).categoryName).toBe('Slides');
    expect(find(listingId('prod_boot', 'sel_sole')).condition).toBe('used');
    expect(find(listingId('prod_slides', 'sel_kickz')).condition).toBe('new');
  });

  it('usa o DID do metadata do vendedor, ou o id dele', () => {
    expect(find(listingId('prod_slides', 'sel_sole')).seller.did).toBe('did:plc:sole');
    expect(find(listingId('prod_slides', 'sel_kickz')).seller.did).toBe('sel_kickz');
  });
});

describe('queryListings', () => {
  it('esconde itens sem estoque e filtra por busca, categoria e vendedor', () => {
    expect(queryListings(listings, {}).items.map(l => l.id)).not.toContain(listingId('prod_boot', 'sel_sole'));
    expect(queryListings(listings, { search: 'kickz' }).items).toHaveLength(1);
    expect(queryListings(listings, { category: 'Slides' }).items).toHaveLength(2);
    expect(queryListings(listings, { seller: 'did:plc:sole' }).items).toHaveLength(1);
  });

  it('ordena por preço', () => {
    expect(queryListings(listings, { sort: 'price_asc' }).items.map(l => l.priceCents)).toEqual([55200, 60000]);
    expect(queryListings(listings, { sort: 'price_desc' }).items.map(l => l.priceCents)).toEqual([60000, 55200]);
  });

  it('pagina por cursor', () => {
    const first = queryListings(listings, { limit: 1, sort: 'price_asc' });
    expect(first.nextCursor).toBe('1');
    const second = queryListings(listings, { limit: 1, sort: 'price_asc', cursor: first.nextCursor! });
    expect(second.items[0]!.priceCents).toBe(60000);
    expect(second.nextCursor).toBeNull();
  });
});

describe('toCategories', () => {
  it('lista só categorias com estoque, em ordem alfabética', () => {
    expect(toCategories(listings).map(c => c.name)).toEqual(['Slides']);
  });
});

describe('purchasables', () => {
  it('lista só ofertas com preço e estoque, da mais barata para a mais cara', async () => {
    const { toPurchasables, pickOffer } = await import('../src/mapping.ts');
    const map = toPurchasables(offers);
    const kickz = map.get(listingId('prod_slides', 'sel_kickz'))!;
    expect(kickz.map(o => [o.offerId, o.unitCents, o.stock])).toEqual([
      ['o2', 60000, 4],
      ['o1', 71400, 3],
    ]);
    expect(map.has(listingId('prod_boot', 'sel_sole'))).toBe(false); // sem estoque
    expect(map.has(listingId('prod_boot', 'sel_kickz'))).toBe(false); // sem preço
  });

  it('escolhe a oferta mais barata que atende a quantidade', async () => {
    const { toPurchasables, pickOffer } = await import('../src/mapping.ts');
    const map = toPurchasables(offers);
    const id = listingId('prod_slides', 'sel_kickz');
    expect(pickOffer(map, id, 2)?.offerId).toBe('o2');
    expect(pickOffer(map, id, 4)?.offerId).toBe('o2');
    expect(pickOffer(map, id, 5)).toBeNull();
    expect(pickOffer(map, 'nao-existe', 1)).toBeNull();
  });
});
