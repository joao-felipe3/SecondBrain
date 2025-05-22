// https://nuxt.com/docs/api/configuration/nuxt-config
import { resolve } from "path";
import vuetify from "vite-plugin-vuetify";

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  alias: {
    "@": resolve(__dirname, "/"),
  },

  css: [
    'vuetify/styles',
    '~/assets/css/tailwind.css',
    '~/assets/main.scss',
  ],

  build: {
    transpile: ['vuetify'],
    postcss: {
      plugins: {
        tailwindcss: {},
        autoprefixer: {},
      },
    },
  },

  vite: {
    define: {
      'process.env.DEBUG': false,
    },
    plugins: [vuetify()],
  },

  modules: ["@vueuse/nuxt"],

  app: {
    head: {
      link: [
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Irish+Grover&display=swap',
        },
      ],
    },
  },
});
