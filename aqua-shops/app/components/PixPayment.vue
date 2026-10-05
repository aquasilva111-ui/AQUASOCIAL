<!--app/components/PixPayment.vue-->
<script setup>
const { order, clearCart } = useCheckout();
const copied = ref(false);

async function copy() {
  try {
    await navigator.clipboard.writeText(order.value.pix.payload);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {}
}

// Consulta o pedido até o Pix ser pago (a confirmação chega por webhook na API).
async function refresh() {
  if (order.value?.status !== 'pending_payment') return;
  try {
    const next = await $fetch('/api/order', { query: { id: order.value.id } });
    if (next.status !== 'pending_payment') {
      order.value = next;
      if (next.status === 'paid') clearCart();
    }
  } catch {}
}
const { pause } = useIntervalFn(refresh, 4000);
onBeforeUnmount(pause);

const expires = computed(() => (order.value?.pix?.expiresAt ? new Date(order.value.pix.expiresAt.replace(' ', 'T')).toLocaleString() : ''));
</script>

<template>
  <div class="w-[calc(100vw-24px)] sm:w-96 p-5 flex flex-col items-center gap-3 text-center">
    <div class="text-lg font-semibold">{{ $t('checkout.pix.title') }}</div>
    <div class="text-sm text-neutral-500 dark:text-neutral-300">{{ $t('checkout.pix.scan') }}</div>
    <img v-if="order.pix?.qrCodeBase64" :src="`data:image/png;base64,${order.pix.qrCodeBase64}`" alt="QR Code Pix" class="w-52 h-52 rounded-2xl bg-white p-2" />
    <div class="font-bold text-xl">{{ formatMoney(order.totalCents) }}</div>
    <button type="button" @click="copy" class="w-full h-11 rounded-xl bg-aqua-700 text-white font-semibold active:scale-95 transition">
      {{ copied ? $t('checkout.pix.copied') : $t('checkout.pix.copy') }}
    </button>
    <div class="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
      <UIcon name="i-svg-spinners-90-ring-with-bg" size="14" />
      {{ $t('checkout.pix.waiting') }}
    </div>
    <div v-if="expires" class="text-xs text-neutral-400">{{ $t('checkout.pix.expires', { date: expires }) }}</div>
  </div>
</template>
