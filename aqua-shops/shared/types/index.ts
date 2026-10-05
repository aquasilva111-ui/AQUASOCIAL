/**
 * Contrato da Aqua Shops. O storefront só conhece estes tipos; quem os entrega
 * é a API da Aqua Shops (hoje na frente do Mercur) ou o catálogo de demonstração.
 * Dinheiro é sempre em centavos inteiros (BRL).
 */

export type ProductCondition = 'new' | 'used';

export type SortOrder = 'new' | 'price_asc' | 'price_desc';

export interface Seller {
  /** DID do perfil AQUA do vendedor. */
  did: string;
  handle: string;
  displayName: string;
  avatar?: string;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  /** Preço "de": se maior que priceCents, o produto está em oferta. */
  compareAtCents?: number;
  images: string[];
  categoryId: string;
  categoryName: string;
  condition: ProductCondition;
  stock: number;
  seller: Seller;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  image?: string;
}

export interface ProductsPage {
  items: Product[];
  nextCursor: string | null;
}

export interface ProductQuery {
  cursor?: string;
  search?: string;
  category?: string;
  seller?: string;
  sort?: SortOrder;
  limit?: number;
}

export type CartProduct = Pick<Product, 'id' | 'title' | 'priceCents' | 'compareAtCents' | 'images' | 'stock' | 'seller'>;

export interface CartItem {
  productId: string;
  quantity: number;
  product: CartProduct;
}

export type AddBtnStatus = 'add' | 'loading' | 'added';

export interface CheckoutUserDetails {
  email: string;
  name: string;
  /** CPF ou CNPJ, só dígitos. O Asaas exige para cobrar no Pix. */
  cpfCnpj: string;
  phone: string;
  city: string;
  address: string;
}

export interface CheckoutInput {
  items: Array<{ productId: string; quantity: number }>;
  buyer: CheckoutUserDetails;
  paymentMethod: 'pix';
}

export type OrderStatus = 'pending_payment' | 'paid' | 'expired' | 'cancelled' | 'failed';

export interface PixCharge {
  /** Código "copia e cola". */
  payload: string;
  /** QR Code em base64 (PNG). */
  qrCodeBase64: string;
  expiresAt: string;
}

export interface Order {
  id: string;
  number: string;
  totalCents: number;
  createdAt: string;
  paymentMethod: 'pix';
  status: OrderStatus;
  /** Presente enquanto o pedido espera pagamento. */
  pix?: PixCharge;
  /** true quando o pedido veio do catálogo de demonstração (nada é cobrado). */
  demo: boolean;
}

export type CheckoutStatus = 'order' | 'processing';
