/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette (Ivory & Ink). The current landing page styles itself
        // via CSS variables in globals.css; these tokens make Tailwind usable
        // for any new components built on top.
        neon: '#CCFF00',
        'neon-dark': '#B8E600',
        lemon: '#EEFFA8',
        ink: '#0a0a0a',
        ivory: '#F5F5F5',
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
