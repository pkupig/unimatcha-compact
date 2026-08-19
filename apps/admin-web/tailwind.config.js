/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // ── Ivory & Ink palette (matches the H5 app) ──
        neon: '#CCFF00',
        'neon-dark': '#B8E600',
        'neon-pink': '#FF2EC4',
        ink: '#000000',
        surface: '#f9f9f9',
        'surface-low': '#f3f3f3',
        'surface-high': '#e8e8e8',
        'surface-higher': '#e2e2e2',
        outline: '#777777',
        'outline-variant': '#c6c6c6',
        'on-surface': '#1b1b1b',
        'on-surface-variant': '#474747',
        // Legacy `primary` was pink — remapped to the ink scale so every existing
        // `bg-primary-*` / `text-primary-*` usage across pages re-skins automatically.
        primary: {
          50: '#f3f3f3',
          100: '#e8e8e8',
          500: '#000000',
          600: '#1b1b1b',
          700: '#000000',
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        sm: '10px',
        DEFAULT: '10px',
        md: '10px',
        lg: '10px',
        xl: '10px',
        '2xl': '10px',
        '3xl': '10px',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
