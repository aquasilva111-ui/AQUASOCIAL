<script setup lang="ts">
import type { Product } from '#shared/types';

const props = defineProps<{ info: Product }>();

const { site } = useAppConfig();
const url = useRequestURL();
const { locale } = useI18n();

const canonical = `${url.origin}${url.pathname}`;
const absolutize = (u?: string) => (!u ? '' : u.startsWith('http') ? u : `${url.origin}${u}`);
const ogImage = absolutize(props.info.images[0]);
const description = props.info.description.replace(/\s+/g, ' ').trim().slice(0, 160);

const productSchema = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: props.info.title,
  description,
  image: props.info.images.map(absolutize),
  brand: { '@type': 'Brand', name: props.info.seller.displayName },
  offers: {
    '@type': 'Offer',
    priceCurrency: 'BRL',
    price: (props.info.priceCents / 100).toFixed(2),
    itemCondition: props.info.condition === 'new' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
    availability: props.info.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
  },
};

useSeoMeta({
  title: props.info.title,
  description,
  ogTitle: props.info.title,
  ogDescription: description,
  ogType: 'article',
  ogImage,
  ogUrl: canonical,
  ogSiteName: site.name,
  twitterTitle: props.info.title,
  twitterDescription: description,
  twitterCard: 'summary_large_image',
  twitterImage: ogImage,
});

useHead({
  htmlAttrs: { lang: locale.value },
  link: [{ rel: 'canonical', href: canonical }],
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(productSchema) }],
});
</script>

<template>
  <slot />
</template>
