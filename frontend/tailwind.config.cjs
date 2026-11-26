/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0907',
        surface: '#14100c',
        'surface-2': '#1b150f',
        elevated: '#221a12',
        border: {
          DEFAULT: '#2e2318',
          glow: 'rgba(249,115,22,0.35)',
        },
        'border-glow': 'rgba(249,115,22,0.35)',
        brand: {
          DEFAULT: '#f97316',
          light: '#fb923c',
          dark: '#c2570c',
        },
        'brand-light': '#fb923c',
        'brand-dark': '#c2570c',
        text: {
          DEFAULT: '#f5ede4',
        },
        muted: '#a8998a',
        faint: '#6f6254',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#3b82f6',

        // Old color aliases to preserve backward compatibility:
        navy: {
          950: '#0b0907',
          900: '#14100c',
          800: '#1b150f',
        },
        accent: '#f97316',
        critical: '#ef4444',
        allow: '#22c55e',
      },
      boxShadow: {
        glow: '0 0 25px -5px rgba(249, 115, 22, 0.35)',
        'glow-sm': '0 0 15px -3px rgba(249, 115, 22, 0.25)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #fb923c, #ea580c)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
