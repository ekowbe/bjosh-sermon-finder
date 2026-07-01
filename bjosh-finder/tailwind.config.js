/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#FAF6EF',
        surface: '#FFFFFF',
        'surface-2': '#F3EDE1',
        ink: '#211C17',
        muted: '#6B6157',
        faint: '#A89E90',
        line: '#ECE3D4',
        gold: { DEFAULT: '#B26B12', bright: '#E5A53B' },
        clay: '#6E2A23',
        espresso: '#2A211A',
      },
      fontFamily: {
        serif: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 2px 10px rgba(33,28,23,0.06)',
        lift: '0 8px 28px rgba(33,28,23,0.10)',
        gold: '0 10px 30px rgba(178,107,18,0.32)',
      },
      keyframes: {
        'ping-slow': { '0%': { transform: 'scale(1)', opacity: '0.5' }, '100%': { transform: 'scale(1.7)', opacity: '0' } },
        'ping-slower': { '0%': { transform: 'scale(1)', opacity: '0.3' }, '100%': { transform: 'scale(2.2)', opacity: '0' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'ping-slow': 'ping-slow 1.6s cubic-bezier(0,0,0.2,1) infinite',
        'ping-slower': 'ping-slower 1.6s cubic-bezier(0,0,0.2,1) 0.4s infinite',
        'rise-in': 'rise-in 0.3s ease-out both',
      },
    },
  },
  plugins: [],
};
