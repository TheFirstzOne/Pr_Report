module.exports = {
  content: ["./index.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Sarabun', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        primary: "#6366f1",
        "primary-hover": "#4f46e5",
        "neutral-bg": "#f8fafc",
        "neutral-border": "#f1f5f9",
        "neutral-sidebar": "#020617",
        "accent-success": "#10b981",
        "accent-warning": "#f59e0b",
        "accent-danger": "#f43f5e"
      }
    },
  },
  plugins: [],
}
