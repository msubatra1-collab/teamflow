module.exports = {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#222833',
        paper: '#f7f6f2',
        persimmon: '#e76f51',
        sage: '#5d8b78',
        amber: '#d69b3d'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'sans-serif']
      },
      boxShadow: {
        panel: '0 12px 36px rgba(34, 40, 51, 0.06)',
        card: '0 3px 12px rgba(34, 40, 51, 0.055)'
      }
    }
  },
  plugins: []
};
