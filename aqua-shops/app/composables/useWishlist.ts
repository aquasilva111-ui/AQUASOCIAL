import type { Product } from '#shared/types';

const WISHLIST_STORAGE_KEY = 'aqua-shops-wishlist';

export const useWishlist = (product?: Product | null) => {
  const wishlist = useState<Product[]>('wishlist', () => []);

  const isWishlisted = computed(() => !!product && wishlist.value.some(item => item.id === product.id));

  const persistWishlist = () => {
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist.value));
    } catch {}
  };

  const toggleWishlist = (item: Product) => {
    const exists = wishlist.value.some(existing => existing.id === item.id);
    wishlist.value = exists ? wishlist.value.filter(existing => existing.id !== item.id) : [...wishlist.value, item];
    persistWishlist();
  };

  const removeFromList = (id: string) => {
    wishlist.value = wishlist.value.filter(item => item.id !== id);
    persistWishlist();
  };

  onMounted(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY) || '[]');
      if (Array.isArray(parsed)) wishlist.value = parsed;
    } catch {}
  });

  return { isWishlisted, toggleWishlist, removeFromList, wishlist };
};
