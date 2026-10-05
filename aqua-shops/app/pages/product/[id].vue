<!--app/pages/product/[id].vue-->
<script setup>
import { Swiper, SwiperSlide } from 'swiper/vue';
import { Navigation, Pagination, Thumbs } from 'swiper/modules';
const { isOpenImageSliderModal } = useComponents();
const localePath = useLocalePath();

import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

const thumbsSwiper = ref(null);
const setThumbsSwiper = swiper => {
  thumbsSwiper.value = swiper;
};

const modules = [Navigation, Pagination, Thumbs];

const route = useRoute();
const id = computed(() => String(route.params.id));

const { data: product, error } = await useFetch('/api/product', { query: { id: id.value }, key: `product-${id.value}` });

if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Produto não encontrado', fatal: true });
}

const related = ref([]);
onMounted(async () => {
  const res = await $fetch('/api/products', { query: { category: product.value.categoryName, limit: 7 } });
  related.value = res.items.filter(p => p.id !== product.value.id).slice(0, 6);
});

const { handleAddToCart, addToCartButtonStatus } = useCart();
const soldOut = computed(() => product.value.stock < 1);
</script>

<template>
  <ProductSeo :info="product" />
  <div class="justify-center flex flex-col lg:flex-row lg:mx-5">
    <ButtonBack />
    <div class="mr-6 mt-5 pt-2.5 max-xl:hidden">
      <swiper :modules="modules" @swiper="setThumbsSwiper" class="product-images-thumbs w-14">
        <swiper-slide v-for="(src, i) in product.images" :key="i" class="cursor-pointer rounded-xl overflow-hidden border-2 border-white dark:border-black">
          <NuxtImg :alt="product.title" class="h-full w-full border-2 border-white bg-neutral-200 dark:bg-neutral-800 dark:border-black rounded-[10px]" :src="src" />
        </swiper-slide>
      </swiper>
    </div>
    <div
      class="flex lg:p-5 lg:gap-5 flex-col lg:flex-row lg:border lg:border-transparent lg:dark:border-[#262626] lg:rounded-[32px] lg:shadow-[0_1px_20px_rgba(0,0,0,.15)] lg:mt-2.5 select-none">
      <div class="relative">
        <swiper
          :style="{ '--swiper-navigation-color': '#000', '--swiper-pagination-color': 'rgb(0 0 0 / 50%)' }"
          :spaceBetween="4"
          :slidesPerView="1.5"
          :pagination="{ dynamicBullets: true }"
          :navigation="true"
          :modules="modules"
          :thumbs="{ swiper: thumbsSwiper }"
          class="lg:w-[530px] lg:h-[530px] xl:w-[600px] xl:h-[600px] lg:rounded-2xl">
          <swiper-slide v-for="(src, i) in product.images" :key="i" @click="isOpenImageSliderModal = true">
            <NuxtImg :alt="product.title" class="h-full w-full bg-neutral-200 dark:bg-neutral-800" :src="src" />
          </swiper-slide>
        </swiper>
      </div>
      <ImageSliderWithModal :images="product.images" v-model="isOpenImageSliderModal" />
      <div class="w-full lg:max-w-[28rem]">
        <div class="flex-col flex gap-4 lg:max-h-[530px] xl:max-h-[600px] overflow-hidden">
          <div class="p-3 lg:pb-4 lg:p-0 border-b border-[#efefef] dark:border-[#262626]">
            <h1 class="text-2xl font-semibold mb-1">{{ product.title }}</h1>
            <ProductPrice :price-cents="product.priceCents" :compare-at-cents="product.compareAtCents" />
          </div>

          <NuxtLink
            :to="localePath(`/?seller=${encodeURIComponent(product.seller.did)}`)"
            class="mx-3 lg:mx-0 flex items-center gap-3 rounded-2xl bg-black/5 dark:bg-white/10 hover:bg-black/10 hover:dark:bg-white/15 p-3 transition">
            <div class="w-10 h-10 rounded-full bg-aqua-700 text-white flex items-center justify-center font-semibold uppercase">
              {{ product.seller.displayName.slice(0, 1) }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-xs opacity-60">{{ $t('product.seller') }}</div>
              <div class="font-semibold truncate">{{ product.seller.displayName }} <span class="font-normal opacity-60">@{{ product.seller.handle }}</span></div>
            </div>
            <span class="text-sm font-semibold text-aqua-700 dark:text-aqua-400">{{ $t('product.view_store') }}</span>
          </NuxtLink>

          <div class="pb-4 px-3 lg:px-0 border-b border-[#efefef] dark:border-[#262626]">
            <div class="text-sm font-semibold leading-5 opacity-60 flex gap-3 mb-3">
              <span>{{ $t('product.condition') }}: {{ $t(`product.${product.condition}`) }}</span>
              <span v-if="soldOut">{{ $t('product.out_of_stock') }}</span>
              <span v-else-if="product.stock <= 5">{{ $t('product.stock_left', { count: product.stock }) }}</span>
            </div>
            <div class="flex">
              <button
                @click="handleAddToCart(product.id)"
                :disabled="addToCartButtonStatus !== 'add' || soldOut"
                class="button-bezel w-full h-12 rounded-md relative tracking-wide font-semibold text-white text-sm flex justify-center items-center disabled:opacity-50">
                <Transition name="slide-up">
                  <div v-if="addToCartButtonStatus === 'add'" class="absolute">{{ $t('cart.add_to_cart') }}</div>
                  <UIcon v-else-if="addToCartButtonStatus === 'loading'" class="absolute" name="i-svg-spinners-90-ring-with-bg" size="22" />
                  <div v-else-if="addToCartButtonStatus === 'added'" class="absolute">{{ $t('cart.added_to_cart') }}!</div>
                </Transition>
              </button>
              <ButtonWishlist :product="product" />
            </div>
          </div>
          <div class="px-3 lg:px-0">
            <div class="text-base mb-2 font-semibold">{{ $t('product.featured_information') }}</div>
            <p class="leading-7 text-sm">{{ product.description }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
  <template v-if="related.length">
    <div class="text-lg lg:text-xl lg:text-center font-semibold mt-4 pt-4 px-3 border-t border-[#efefef] dark:border-[#262626] lg:border-none">{{ $t('product.shop_similar') }}</div>
    <div class="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-7 gap-4 px-3 lg:px-5 xl:px-8 mt-4 lg:mt-5">
      <ProductCard :products="related" />
    </div>
  </template>
</template>

<style lang="postcss">
.product-images-thumbs .swiper-wrapper {
  @apply flex-col gap-3;
}
.product-images-thumbs .swiper-slide-thumb-active {
  @apply border-black dark:border-white;
}
.swiper-button-next,
.swiper-button-prev {
  @apply bg-white/50 hover:bg-white p-3.5 m-2 rounded-full flex items-center justify-center shadow transition backdrop-blur-sm;
}

.swiper-button-prev.swiper-button-disabled,
.swiper-button-next.swiper-button-disabled {
  @apply hidden;
}

.swiper-pagination {
  @apply bg-white/50 shadow-sm rounded-full py-1 backdrop-blur-sm;
}

.button-bezel {
  box-shadow: 0 0 0 var(--button-outline, 0px) rgb(0, 43, 239, 0.3), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.25), inset 0 1px 0 0 rgba(255, 255, 255, 0.3),
    0 1px 2px 0 rgba(0, 0, 0, 0.5);
  @apply bg-aqua-700 outline-none tracking-[-0.125px] transition scale-[var(--button-scale,1)] duration-200;
  &:hover {
    @apply bg-aqua-600;
  }
  &:active {
    --button-outline: 4px;
    --button-scale: 0.975;
  }
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease 0s, opacity 0.3s ease 0s;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(-30px) scale(0);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(30px) scale(0);
}
</style>
