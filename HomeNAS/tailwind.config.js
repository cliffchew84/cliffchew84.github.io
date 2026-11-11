/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      keyframes: {
        'toast-in': {
          from: { opacity: '0', transform: 'translate(-50%, 12px)' },
          to: { opacity: '1', transform: 'translate(-50%, 0)' }
        }
      },
      animation: {
        'toast-in': 'toast-in .18s ease-out'
      }
    }
  },
  plugins: []
};
