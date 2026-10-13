import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1e40af',
          dark: '#1e3a8a',
          light: '#3b82f6',
          soft: '#dbeafe',
        },
        surface: '#ffffff',
        bg: '#f1f5f9',
        border: '#e2e8f0',
        'border-strong': '#cbd5e1',
        text: {
          DEFAULT: '#0f172a',
          soft: '#475569',
          muted: '#94a3b8',
        },
        success: {
          DEFAULT: '#16a34a',
          soft: '#dcfce7',
        },
        warning: {
          DEFAULT: '#f59e0b',
          soft: '#fef3c7',
        },
        danger: {
          DEFAULT: '#dc2626',
          soft: '#fee2e2',
        },
        info: {
          DEFAULT: '#0891b2',
          soft: '#cffafe',
        },
      },
      borderRadius: {
        'radius': '10px',
        'radius-sm': '6px',
        'radius-lg': '14px',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
        'md': '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.05)',
        'lg': '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.05)',
      }
    },
  },
  plugins: [],
};

export default config;
