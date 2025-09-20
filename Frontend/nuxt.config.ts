// https://nuxt.com/docs/api/configuration/nuxt-config
import { resolve } from "path";
import vuetify from "vite-plugin-vuetify";

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  alias: {
    "@": resolve(__dirname, "/"),
      // Garante que 'form-data' use 'formdata-node' no server
      'form-data': process.env.NUXT_ENV_SSR === 'true' ? 'formdata-node' : 'form-data',
  },

  css: [
    'vuetify/styles',
    '~/assets/css/tailwind.css',
    '~/assets/main.scss',
    '~/assets/styles/custom-input.css',
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
    optimizeDeps: {
      exclude: ['form-data']
    },
    ssr: {
      noExternal: ['axios'],     // força axios a rodar como browser no client
      external: ['form-data']    // garante que form-data não vá pro client
    }
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

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3000',
    },
  },
});
