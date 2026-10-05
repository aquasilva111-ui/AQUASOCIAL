import { push } from 'notivue';
import type { CheckoutStatus, CheckoutUserDetails, Order } from '#shared/types';

const defaultUserDetails = (): CheckoutUserDetails => ({ email: '', name: '', phone: '', city: '', address: '' });

export const useCheckout = () => {
  const { t } = useI18n();
  const { cart } = useCart();
  const order = useState<Order | null>('order', () => null);
  const userDetails = useState<CheckoutUserDetails>('userDetails', defaultUserDetails);
  const checkoutStatus = ref<CheckoutStatus>('order');

  const clearCart = () => {
    cart.value = [];
    try {
      localStorage.setItem('aqua-shops-cart', '[]');
    } catch {}
  };

  const handleCheckout = async () => {
    if (checkoutStatus.value !== 'order') return;
    checkoutStatus.value = 'processing';
    try {
      order.value = await $fetch<Order>('/api/checkout', {
        method: 'POST',
        body: {
          items: cart.value.map(i => ({ productId: i.productId, quantity: i.quantity })),
          buyer: { ...userDetails.value },
          paymentMethod: 'pix',
        },
      });
      clearCart();
    } catch (error: any) {
      push.error(error?.statusCode === 409 ? t('errors.insufficient_stock') : t('errors.checkout_failed'));
    } finally {
      checkoutStatus.value = 'order';
    }
  };

  return { order, userDetails, checkoutStatus, handleCheckout };
};
