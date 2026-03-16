/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['CircularStd', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#fdf2f7',
          100: '#fce7f1',
          200: '#fbcfe4',
          300: '#f9a8cf',
          400: '#f472b0',
          500: '#e84d8a',
          600: '#d42d6b',
          700: '#A91D54',
          800: '#921b4a',
          900: '#7a1940',
          950: '#4a0a22',
        },
        slate: {
          850: '#172033',
          950: '#0a0f1a',
        },
      },
      boxShadow: {
        'sidebar': '2px 0 8px rgba(0, 0, 0, 0.04)',
        'sidebar-dark': '2px 0 8px rgba(0, 0, 0, 0.3)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
      },
      animation: {
        'slide-up': 'slide-up 0.5s ease-out forwards',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      keyframes: {
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(169, 29, 84, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(169, 29, 84, 0.6)' },
        },
      },
    },
  },
  plugins: [],
}
