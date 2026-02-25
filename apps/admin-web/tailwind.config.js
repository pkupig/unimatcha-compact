/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff0f3',
          100: '#ffe0e8',
          500: '#ff4d6d',
          600: '#e63559',
          700: '#c72144',
        },
      },
    },
  },
  plugins: [],
};
