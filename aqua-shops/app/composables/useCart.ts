import { push } from 'notivue';
import type { AddBtnStatus, CartItem, CartProduct } from '#shared/types';

const CART_STORAGE_KEY = 'aqua-shops-cart';

export const useCart = () => {
  const { t } = useI18n();
  const cart = useState<CartItem[]>('cart', () => []);
  const addToCartButtonStatus = ref<AddBtnStatus>('add');

  const persistCart = () => {
    if (!import.meta.client) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart.value));
    } catch {}
  };

  const setCart = (items: CartItem[]) => {
    cart.value = items;
    persistCart();
  };

  const find = (productId: string) => cart.value.find(item => item.productId === productId);

  const handleAddToCart = async (productId: string) => {
    const existing = find(productId);
    if (existing) return increment(productId);

    addToCartButtonStatus.value = 'loading';
    try {
      const { product } = await $fetch<{ product: CartProduct }>('/api/cart/add', { method: 'POST', body: { productId } });
      setCart([...cart.value, { productId, quantity: 1, product }]);
      addToCartButtonStatus.value = 'added';
      setTimeout(() => (addToCartButtonStatus.value = 'add'), 2000);
    } catch {
      addToCartButtonStatus.value = 'add';
      push.error(t('errors.insufficient_stock'));
    }
  };

  const changeQuantity = (productId: string, quantity: number) => {
    setCart(quantity <= 0 ? cart.value.filter(i => i.productId !== productId) : cart.value.map(i => (i.productId === productId ? { ...i, quantity } : i)));
  };

  function increment(productId: string) {
    const item = find(productId);
    if (!item) return void handleAddToCart(productId);
    if (item.quantity >= item.product.stock) return void push.error(t('errors.insufficient_stock'));
    changeQuantity(productId, item.quantity + 1);
  }

  const decrement = (productId: string) => {
    const item = find(productId);
    if (item) changeQuantity(productId, item.quantity - 1);
  };

  onMounted(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
      if (Array.isArray(parsed)) cart.value = parsed;
    } catch {}
  });

  return { cart, addToCartButtonStatus, handleAddToCart, increment, decrement };
};
