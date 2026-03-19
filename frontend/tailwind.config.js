/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          sky:    '#ddeefe',
          shell:  '#ade1ff',
          orange: '#D4401A',
          ink:    '#1a1a2e',
          navy:   '#3d4466',
          muted:  '#7a7f9a',
          border: '#dde2ee',
          'border-md': '#c5cad9',
        },
      },
      fontFamily: {
        sans:    ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['DM Sans', 'system-ui', 'sans-serif'],
        serif:   ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
