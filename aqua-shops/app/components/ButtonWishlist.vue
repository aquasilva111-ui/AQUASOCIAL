<!--app/components/ButtonWishlist.vue-->
<script setup lang="ts">
import type { Product } from '#shared/types';

const props = defineProps<{ product: Product }>();
const { isWishlisted, toggleWishlist } = useWishlist(props.product);
</script>

<template>
  <button :aria-label="$t('nav.favorites')" @click="toggleWishlist(props.product)" class="active:scale-95 transition">
    <div
      :class="[
        'w-12 h-12 rounded-full ml-3 flex justify-center items-center',
        isWishlisted ? 'bg-aqua-100 dark:bg-aqua-950' : 'bg-neutral-200 dark:bg-neutral-800',
      ]">
      <UIcon
        :name="isWishlisted ? 'i-iconamoon-heart-fill' : 'i-iconamoon-heart'"
        size="26"
        :class="isWishlisted ? 'text-aqua-500 dark:text-aqua-400 pulse-heart' : 'text-neutral-900 dark:text-neutral-200'" />
    </div>
  </button>
</template>
