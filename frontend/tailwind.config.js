/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'skia-blue': '#0066FF',
        'skia-navy': '#001F3F',
        'skia-light': '#F8FAFB',
      },
      backdropBlur: {
        xl: '20px',
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};
