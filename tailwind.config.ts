import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        destiny: {
          base:       '#060612',
          violet:     '#7C3AED',
          rose:       '#BE185D',
          amber:      '#F59E0B',
          'rose-light': '#F472B6',
          'violet-light': '#A78BFA',
        },
      },
      backgroundImage: {
        'fate-gradient':   'linear-gradient(135deg, #7C3AED, #BE185D)',
        'fate-gradient-r': 'linear-gradient(to right, #7C3AED, #BE185D, #F59E0B)',
      },
      boxShadow: {
        'glow-violet': '0 0 24px rgba(124, 58, 237, 0.55)',
        'glow-rose':   '0 0 24px rgba(190, 24, 93, 0.55)',
        'glow-amber':  '0 0 20px rgba(245, 158, 11, 0.50)',
        'glow-white':  '0 0 30px rgba(255, 255, 255, 0.30)',
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
      keyframes: {
        'orb-float-1': {
          '0%':   { transform: 'translate(0px, 0px)' },
          '20%':  { transform: 'translate(40px, -30px)' },
          '45%':  { transform: 'translate(-20px, -60px)' },
          '70%':  { transform: 'translate(55px, -20px)' },
          '100%': { transform: 'translate(0px, 0px)' },
        },
        'orb-float-2': {
          '0%':   { transform: 'translate(0px, 0px)' },
          '25%':  { transform: 'translate(-45px, 20px)' },
          '50%':  { transform: 'translate(25px, 50px)' },
          '75%':  { transform: 'translate(-30px, -30px)' },
          '100%': { transform: 'translate(0px, 0px)' },
        },
        'orb-float-3': {
          '0%':   { transform: 'translate(0px, 0px)' },
          '30%':  { transform: 'translate(30px, 40px)' },
          '60%':  { transform: 'translate(-50px, 10px)' },
          '80%':  { transform: 'translate(10px, -40px)' },
          '100%': { transform: 'translate(0px, 0px)' },
        },
        'orb-float-4': {
          '0%':   { transform: 'translate(0px, 0px)' },
          '35%':  { transform: 'translate(-25px, -45px)' },
          '65%':  { transform: 'translate(45px, 25px)' },
          '85%':  { transform: 'translate(-15px, 40px)' },
          '100%': { transform: 'translate(0px, 0px)' },
        },
        'orb-float-5': {
          '0%':   { transform: 'translate(0px, 0px)' },
          '20%':  { transform: 'translate(50px, 30px)' },
          '50%':  { transform: 'translate(-30px, -20px)' },
          '75%':  { transform: 'translate(20px, -50px)' },
          '100%': { transform: 'translate(0px, 0px)' },
        },
        'orb-pulse': {
          '0%, 100%': { opacity: '0.7', transform: 'scale(1)' },
          '50%':      { opacity: '1',   transform: 'scale(1.15)' },
        },
        'orb-encounter': {
          '0%, 100%': { boxShadow: '0 0 12px 4px currentColor' },
          '50%':      { boxShadow: '0 0 30px 12px white' },
        },
        'radar-sweep': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'ring-expand': {
          '0%':   { transform: 'scale(0.3)', opacity: '0.6' },
          '100%': { transform: 'scale(1)',   opacity: '0' },
        },
        'count-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'orb-1': 'orb-float-1 12s ease-in-out infinite',
        'orb-2': 'orb-float-2 15s ease-in-out infinite',
        'orb-3': 'orb-float-3 10s ease-in-out infinite',
        'orb-4': 'orb-float-4 14s ease-in-out infinite',
        'orb-5': 'orb-float-5 11s ease-in-out infinite',
        'orb-pulse': 'orb-pulse 3s ease-in-out infinite',
        'radar-sweep': 'radar-sweep 8s linear infinite',
        'ring-expand': 'ring-expand 3s ease-out infinite',
        'count-up': 'count-up 0.5s ease-out forwards',
      },
    },
  },
  plugins: [],
}
export default config
