/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './components/**/*.{vue,js}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './nuxt.config.{js,ts}',
  ],
  theme: {
    extend: {
      colors: {
        'gradient-primary': 'linear-gradient(45deg, #002697, #005AC9, #00C8FF)',
      },
    },
  },
  plugins: [],
}

