import type { Config } from 'tailwindcss';

export default <Partial<Config>>{
  theme: {
    extend: {
      screens: {
        xs: '320px',
        '3xl': '1920px',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        'secondary-text': '#737373',
        'secondary-text-d': '#a8a8a8',
        // Azul da marca AQUA (#002BEF = 700)
        aqua: {
          '50': '#eef3ff',
          '100': '#dde7ff',
          '200': '#c0d1ff',
          '300': '#94b0ff',
          '400': '#5f84ff',
          '500': '#2f55ff',
          '600': '#1237f5',
          '700': '#002bef',
          '800': '#0a28b8',
          '900': '#0f2a8f',
          '950': '#0a1a5c',
        },
      },
    },
  },
};
