import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          page: '#07090d',
          card: '#12161d',
          input: '#181d25',
          elevated: '#1d2430',
        },
        accent: {
          blue: '#3b82f6',
          done: '#22c55e',
        },
      },
      boxShadow: {
        panel: '0 18px 60px rgba(0, 0, 0, 0.32)',
      },
    },
  },
  plugins: [],
} satisfies Config
