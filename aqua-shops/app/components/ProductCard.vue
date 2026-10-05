<!--app/components/ProductCard.vue-->
<script setup lang="ts">
import type { Product } from '#shared/types';

defineProps<{ products: Product[] }>();
const localePath = useLocalePath();
</script>

<template>
  <article v-for="product in products" :key="product.id">
    <NuxtLink :to="localePath(`/product/${product.id}`)" class="group select-none">
      <div class="cursor-pointer transition ease-[ease] duration-300">
        <div class="relative pb-[133%] dark:shadow-[0_8px_24px_rgba(0,0,0,.5)] rounded-2xl overflow-hidden">
          <NuxtImg
            v-if="product.images[1]"
            :alt="product.title"
            loading="lazy"
            :title="product.title"
            :src="product.images[1]"
            class="absolute h-full w-full dark:bg-neutral-800 bg-neutral-200 object-cover" />
          <NuxtImg
            :alt="product.title"
            loading="lazy"
            :title="product.title"
            :src="product.images[0]"
            class="absolute h-full w-full dark:bg-neutral-800 bg-neutral-200 object-cover transition-opacity duration-300 group-hover:opacity-0" />
        </div>
        <div class="grid gap-0.5 pt-3 pb-4 px-1.5 text-sm font-semibold">
          <ProductPrice :price-cents="product.priceCents" :compare-at-cents="product.compareAtCents" variant="card" />
          <div>{{ product.title }}</div>
          <div class="font-normal text-[#5f5f5f] dark:text-[#a3a3a3]">@{{ product.seller.handle }}</div>
        </div>
      </div>
    </NuxtLink>
  </article>
</template>
