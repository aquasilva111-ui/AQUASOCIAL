<!--app/components/ImageSliderWithModal.vue-->
<script setup lang="ts">
const { isOpenImageSliderModal } = useComponents();
defineProps<{ images: string[] }>();
</script>

<template>
  <UModal
    :ui="{
      overlay: { background: 'bg-neutral-200/90 dark:bg-neutral-800/90 backdrop-blur-sm' },
      background: 'bg-bg-transparent dark:bg-bg-transparent',
      container: 'items-center',
      shadow: 'shadow-none',
    }">
    <button
      @click="isOpenImageSliderModal = false"
      class="flex p-2 absolute z-50 right-3 top-3 bg-white/50 hover:bg-white rounded-full items-center justify-center shadow transition backdrop-blur-sm">
      <UIcon name="i-iconamoon-close" class="text-black" size="16" />
    </button>
    <UCarousel
      v-slot="{ item }"
      :items="images"
      :ui="{ item: 'basis-full', container: 'rounded-3xl' }"
      :prev-button="{ icon: 'i-iconamoon-arrow-left-2-duotone' }"
      :next-button="{ icon: 'i-iconamoon-arrow-right-2-duotone' }"
      class="w-full mx-auto"
      arrows>
      <img :src="item" class="w-full select-none" draggable="false" alt="" />
    </UCarousel>
  </UModal>
</template>
