/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0a1020',
          900: '#0f1a30',
        },
        accent: '#3b82f6',
        critical: '#ef4444',
        warning: '#f59e0b',
        allow: '#22c55e',
      },
    },
  },
  plugins: [],
}
