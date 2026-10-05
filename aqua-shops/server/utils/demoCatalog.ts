// Catálogo de demonstração, usado enquanto AQUA_SHOPS_API não está configurada.
// Vendedores e produtos são fictícios. As imagens vêm de /placeholder/<seed>.svg.
import type { Category, Product, Seller } from '#shared/types';

const sellers: Seller[] = [
  { did: 'did:plc:demo000000000000000001', handle: 'casa.aqua', displayName: 'Casa Aqua' },
  { did: 'did:plc:demo000000000000000002', handle: 'estudio.mar', displayName: 'Estúdio Mar' },
  { did: 'did:plc:demo000000000000000003', handle: 'retro.loja', displayName: 'Retrô Loja' },
  { did: 'did:plc:demo000000000000000004', handle: 'trilha.sport', displayName: 'Trilha Sport' },
];

export const demoCategories: Category[] = [
  { id: 'moda', name: 'Moda', image: '/placeholder/moda.svg' },
  { id: 'casa', name: 'Casa', image: '/placeholder/casa.svg' },
  { id: 'eletronicos', name: 'Eletrônicos', image: '/placeholder/eletronicos.svg' },
  { id: 'esporte', name: 'Esporte', image: '/placeholder/esporte.svg' },
  { id: 'livros', name: 'Livros', image: '/placeholder/livros.svg' },
  { id: 'arte', name: 'Arte e design', image: '/placeholder/arte.svg' },
];

// [título, categoria, preço em centavos, preço "de" (0 = sem oferta), condição, estoque, vendedor]
const rows: Array<[string, string, number, number, 'new' | 'used', number, number]> = [
  ['Jaqueta jeans oversized', 'moda', 18990, 24990, 'new', 8, 2],
  ['Tênis de corrida leve', 'esporte', 32900, 0, 'new', 12, 3],
  ['Camiseta algodão orgânico', 'moda', 7990, 0, 'new', 30, 1],
  ['Vaso de cerâmica artesanal', 'casa', 14500, 0, 'new', 5, 0],
  ['Fone bluetooth com cancelamento de ruído', 'eletronicos', 44900, 54900, 'new', 9, 1],
  ['Câmera instantânea vintage', 'eletronicos', 27000, 0, 'used', 1, 2],
  ['Luminária de mesa minimalista', 'casa', 21990, 0, 'new', 14, 0],
  ['Mochila impermeável 25L', 'esporte', 25900, 29900, 'new', 20, 3],
  ['Romance: Mar de Dentro', 'livros', 4990, 0, 'new', 40, 1],
  ['Poster ilustrado A2', 'arte', 6900, 0, 'new', 25, 1],
  ['Vestido midi estampado', 'moda', 15900, 0, 'new', 11, 2],
  ['Relógio analógico retrô', 'moda', 38000, 0, 'used', 1, 2],
  ['Conjunto de xícaras (4 peças)', 'casa', 9900, 12900, 'new', 18, 0],
  ['Teclado mecânico compacto', 'eletronicos', 39900, 0, 'new', 7, 1],
  ['Bola de futsal oficial', 'esporte', 11900, 0, 'new', 22, 3],
  ['Guia de aquarela para iniciantes', 'livros', 5900, 0, 'new', 15, 1],
  ['Caderno de desenho capa dura', 'arte', 4500, 0, 'new', 50, 1],
  ['Tapete de algodão cru', 'casa', 28900, 0, 'new', 6, 0],
  ['Calça cargo utilitária', 'moda', 17900, 21900, 'new', 16, 2],
  ['Bicicleta urbana aro 26', 'esporte', 129900, 0, 'used', 1, 3],
  ['Caixa de som portátil', 'eletronicos', 19900, 0, 'new', 13, 1],
  ['Kit de pincéis (12 peças)', 'arte', 8900, 0, 'new', 28, 1],
  ['Quadro abstrato 50x70', 'arte', 34900, 0, 'new', 3, 1],
  ['Boné de aba curva', 'moda', 5900, 0, 'new', 35, 2],
];

const categoryName = (id: string) => demoCategories.find(c => c.id === id)!.name;

const base = Date.parse('2026-10-01T12:00:00Z');

export const demoProducts: Product[] = rows.map(([title, cat, price, from, condition, stock, sellerIdx], i) => ({
  id: `p${String(i + 1).padStart(3, '0')}`,
  title,
  description: `${title}. Item de demonstração da Aqua Shops, vendido por ${sellers[sellerIdx]!.displayName}.`,
  priceCents: price,
  compareAtCents: from > price ? from : undefined,
  images: [`/placeholder/p${i + 1}a.svg`, `/placeholder/p${i + 1}b.svg`, `/placeholder/p${i + 1}c.svg`],
  categoryId: cat,
  categoryName: categoryName(cat),
  condition,
  stock,
  seller: sellers[sellerIdx]!,
  createdAt: new Date(base - i * 3_600_000).toISOString(),
}));
