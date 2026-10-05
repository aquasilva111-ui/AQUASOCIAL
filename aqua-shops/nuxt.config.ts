// nuxt.config.ts
import pkg from "./package.json";

export default defineNuxtConfig({
  devtools: { enabled: false },

  modules: ["@vueuse/nuxt", "@nuxt/ui", "@nuxt/image", "notivue/nuxt", "@nuxtjs/i18n"],

  app: {
    head: {
      link: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" },
      ],
    },
  },

  i18n: {
    defaultLocale: "pt",
    strategy: "prefix_except_default",
    langDir: "locales",
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "i18n_redirected",
      redirectOn: "root",
      alwaysRedirect: true,
    },
    locales: [
      { code: "pt", iso: "pt-BR", file: "pt-BR.json", name: "🇧🇷 Português" },
      { code: "en", iso: "en-GB", file: "en-GB.json", name: "🇬🇧 English" },
    ],
  },

  // Imagens vêm direto do catálogo/CDN da Aqua Shops, sem otimizador no servidor.
  image: { provider: "none" },

  notivue: {
    position: "top-center",
    limit: 3,
    notifications: { global: { duration: 3000 } },
  },

  css: ["notivue/notification.css", "notivue/animations.css"],

  runtimeConfig: {
    // Base da API da Aqua Shops. Vazia = catálogo de demonstração.
    shopsApi: process.env.AQUA_SHOPS_API || "",
    public: {
      version: pkg.version,
    },
  },

  routeRules: {
    "/categories": { swr: 3600 },
    "/favorites": { swr: 600 },
  },

  compatibilityDate: "2025-01-01",
});
