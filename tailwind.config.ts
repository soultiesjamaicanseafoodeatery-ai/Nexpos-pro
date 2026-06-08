import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bg:     '#0c0e14',
        bg2:    '#111420',
        bg3:    '#161926',
        surf:   '#202538',
        surf2:  '#272d42',
        surf3:  '#2e3550',
        bdr:    '#2a3048',
        bdr2:   '#38425e',
        txt:    '#dde2f0',
        txt2:   '#8b95b5',
        txt3:   '#545e7a',
        blue:   '#4f8ef7',
        grn:    '#3ecf8e',
        amb:    '#f5a623',
        red:    '#f56565',
        pur:    '#9b8afb',
        teal:   '#38bdf8',
        ora:    '#ff7c4c',
      },
    },
  },
  plugins: [],
}
export default config
