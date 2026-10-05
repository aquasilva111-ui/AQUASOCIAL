<script setup lang="ts">
type PriceVariant = 'default' | 'card' | 'cart';

const props = withDefaults(defineProps<{ priceCents: number; compareAtCents?: number; variant?: PriceVariant; quantity?: number }>(), {
  variant: 'default',
  quantity: 1,
});

const sale = computed(() => isOnSale(props.priceCents, props.compareAtCents));
const discount = computed(() => discountPercent(props.priceCents, props.compareAtCents));
const total = computed(() => formatMoney(props.priceCents * props.quantity));
const totalCompare = computed(() => formatMoney((props.compareAtCents ?? 0) * props.quantity));
</script>

<template>
  <div>
    <div v-if="variant === 'default'">
      <p class="text-xl font-bold" :class="sale && 'text-aqua-700 dark:text-aqua-400'">{{ formatMoney(priceCents) }}</p>
      <div v-if="sale" class="flex items-baseline text-sm">
        <p>{{ $t('product.originally') }}:</p>
        <p class="ml-1 line-through">{{ formatMoney(compareAtCents!) }}</p>
        <p class="ml-1 text-aqua-700 dark:text-aqua-400">-{{ discount }}%</p>
      </div>
    </div>

    <div v-else-if="variant === 'card'" class="flex gap-1">
      <span>{{ formatMoney(priceCents) }}</span>
      <span v-if="sale" class="text-[#5f5f5f] dark:text-[#a3a3a3] line-through">{{ formatMoney(compareAtCents!) }}</span>
    </div>

    <div v-else class="gap-1 flex flex-col">
      <div class="font-bold">{{ total }}</div>
      <div v-if="sale" class="flex-wrap text-neutral-600 dark:text-neutral-300 items-baseline text-xs gap-1 flex">
        <p>{{ $t('product.originally') }}:</p>
        <p class="line-through">{{ totalCompare }}</p>
        <p class="text-aqua-700 dark:text-aqua-400">-{{ discount }}%</p>
      </div>
    </div>
  </div>
</template>
