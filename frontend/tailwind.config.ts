import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'app-border': '#343438',
        overlay: 'rgba(0, 0, 0, 0.72)',
        danger: '#ff453a',
        'danger-surface': 'rgba(255, 69, 58, 0.14)',
        warning: '#ffd60a',
        'warning-surface': 'rgba(255, 214, 10, 0.16)',
        surface: {
          page: '#000000',
          card: '#1c1c1e',
          input: '#242426',
          elevated: '#2c2c2e',
          pressed: '#343438',
          success: 'rgba(48, 209, 88, 0.14)',
          warning: 'rgba(255, 214, 10, 0.16)',
          danger: 'rgba(255, 69, 58, 0.14)',
        },
        accent: {
          blue: '#0a84ff',
          pressed: '#0071e3',
          done: '#30d158',
          warning: '#ffd60a',
          danger: '#ff453a',
        },
        text: {
          primary: '#ffffff',
          secondary: '#98989d',
          muted: '#636366',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 24px 80px rgba(0, 0, 0, 0.42)',
      },
      borderRadius: {
        card: '18px',
        button: '14px',
        input: '12px',
        modal: '22px',
      },
      maxWidth: {
        app: '760px',
      },
      spacing: {
        safe: 'max(16px, env(safe-area-inset-top))',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
} satisfies Config
