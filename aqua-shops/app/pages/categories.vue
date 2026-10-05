<!--app/pages/categories.vue-->
<script setup>
const { name } = useAppConfig().site;
const url = useRequestURL();
const localePath = useLocalePath();

const categoriesData = ref([]);
const canonical = url.origin + url.pathname;

useSeoMeta({
  title: 'Categorias',
  ogTitle: 'Categorias',
  description: `Navegue pelas categorias da ${name}.`,
  ogDescription: `Navegue pelas categorias da ${name}.`,
  ogUrl: canonical,
  canonical,
  keywords: `categorias, ${name}`,
  twitterTitle: 'Categorias',
  twitterDescription: `Navegue pelas categorias da ${name}.`,
});

onMounted(() => {
  $fetch('/api/categories').then(
    response => (categoriesData.value = response)
  );
});

const categories = computed(() => categoriesData.value);
</script>

<template>
  <div class="flex flex-wrap justify-center max-w-screen-2xl m-auto">
    <div v-if="!categories.length" v-for="i in 13" :key="i" class="w-full max-w-[444px] p-3 lg:p-2">
      <div class="pb-[75%] relative overflow-hidden bg-neutral-200 dark:bg-neutral-800 skeleton rounded-[32px]"></div>
    </div>
    <NuxtLink v-for="category in categories" :key="category.id" :to="localePath(`/?category=${encodeURIComponent(category.name)}`)" class="w-full max-w-[444px] p-3 lg:p-2">
      <div class="pb-[75%] relative overflow-hidden">
        <NuxtImg
          :alt="category.name"
          v-if="category.image"
          class="object-cover absolute top-0 left-0 w-full h-full bg-neutral-200 dark:bg-neutral-800 rounded-[32px]"
          :src="category.image"
          loading="lazy"
          :title="category.name" />
        <div class="absolute left-0 right-0 top-0 bottom-0 bg-gradient-to-t hover:from-black/40 rounded-[32px] overflow-hidden">
          <div class="w-full h-full bg-gradient-to-t from-black/40 items-end py-6 px-5 flex">
            <div class="w-full text-center font-semibold text-3xl text-white">{{ category.name }}</div>
          </div>
        </div>
      </div>
    </NuxtLink>
  </div>
</template>
