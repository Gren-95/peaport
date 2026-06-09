import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0e14',
          soft: '#11151d',
          card: '#151a24',
          hover: '#1c2330',
        },
        border: {
          DEFAULT: '#222a37',
          soft: '#1a212c',
        },
        accent: {
          DEFAULT: '#7c5cff',
          soft: '#9d86ff',
        },
        ok: '#3ecf8e',
        warn: '#f5a623',
        danger: '#ef4565',
        muted: '#7d8799',
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
