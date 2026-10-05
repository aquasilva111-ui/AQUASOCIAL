<!--app/pages/favorites.vue-->
<script setup>
const { removeFromList, wishlist } = useWishlist();
const { name } = useAppConfig().site;
const url = useRequestURL();
const localePath = useLocalePath();

const canonical = url.origin + url.pathname;

useSeoMeta({
  title: 'Favoritos',
  ogTitle: 'Favoritos',
  description: `Seus produtos favoritos na ${name}.`,
  ogDescription: `Seus produtos favoritos na ${name}.`,
  ogUrl: canonical,
  canonical,
  keywords: `favoritos, ${name}`,
  twitterTitle: 'Favoritos',
  twitterDescription: `Seus produtos favoritos na ${name}.`,
  robots: 'noindex, nofollow',
});
</script>

<template>
  <div class="flex flex-wrap justify-center max-w-screen-2xl m-auto">
    <TransitionGroup
      v-if="wishlist.length"
      name="shrink"
      tag="div"
      mode="in-out"
      v-for="product in wishlist"
      :key="product.id"
      class="w-full sm:max-w-[300px] p-3 lg:p-2 relative select-none">
      <div class="relative overflow-hidden pb-[125%] rounded-[32px]">
        <NuxtImg :alt="product.title" class="absolute w-full h-full object-cover bg-neutral-200 dark:bg-neutral-800" :src="product.images[0]" loading="lazy" />
        <NuxtLink
          class="absolute inset-0 bg-gradient-to-t from-black/50 hover:from-black/60 flex items-end p-5"
          :to="localePath(`/product/${product.id}`)">
          <div class="grid gap-0.5 text-white">
            <ProductPrice :price-cents="product.priceCents" :compare-at-cents="product.compareAtCents" variant="card" />
            <div class="font-bold">{{ product.title }}</div>
            <div class="text-sm font-medium">@{{ product.seller.handle }}</div>
          </div>
        </NuxtLink>
      </div>
      <button class="absolute top-5 right-5 group" :aria-label="$t('favorites.remove')" @click="removeFromList(product.id)">
        <div class="w-12 h-12 rounded-full flex justify-center items-center bg-aqua-950/90 shadow-md">
          <UIcon name="i-iconamoon-heart-fill" size="26" class="text-aqua-500 group-hover:text-white transition pulse-heart" />
        </div>
      </button>
    </TransitionGroup>
    <div
      v-else
      class="w-full flex flex-col items-center px-5 min-h-[calc(100vh-152px)] justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-100 via-white to-white dark:from-neutral-900 dark:via-black dark:to-black rounded-xl">
      <div
        class="bg-aqua-100 dark:bg-aqua-950 rounded-full p-6 flex items-center shadow-2xl shadow-aqua-300 dark:shadow-aqua-950 justify-center">
        <UIcon name="i-iconamoon-heart-fill" class="w-20 h-20 text-aqua-400 dark:text-aqua-700 pulse-heart" />
      </div>
      <div class="font-extrabold text-3xl my-6">{{ $t('favorites.nothing_to_show_yet') }}</div>
      <div class="text-sm text-center mb-5 max-w-md">
        {{ $t('favorites.wishlist_lives_here') }}
      </div>
    </div>
  </div>
</template>

<style lang="postcss">
.shrink-move,
.shrink-enter-active,
.shrink-leave-active {
  transition: all 0.5s cubic-bezier(0.55, 0, 0.1, 1);
}
.shrink-enter-from,
.shrink-leave-to {
  opacity: 0;
  transform: scale(0.75) translateY(25%);
}
.shrink-leave-active {
  position: absolute;
}

@keyframes animateHeart {
  0% {
    transform: scale(0.9);
  }
  5% {
    transform: scale(1.1);
  }
  10% {
    transform: scale(0.9);
  }
  15% {
    transform: scale(1.2);
  }
  50% {
    transform: scale(0.9);
  }
  100% {
    transform: scale(0.9);
  }
}

.pulse-heart {
  animation: animateHeart 1.2s infinite;
}
</style>
