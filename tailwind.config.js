/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#0a0a0c',
        shale: '#1a1c1e',
        slate: '#2d3136',
        quartz: 'rgba(255, 255, 255, 0.03)',
        magma: '#ff4d00',
        'emerald-vein': '#00f2ad',
        'gold-ore': '#d4af37',
        'iron-dust': '#8e8e93',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
