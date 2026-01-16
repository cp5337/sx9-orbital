export const spaceOpsBlack = {
  background: '#0a0c10',
  foreground: '#e6e8ea',
  primaryColor: '#00f0ff',
  accentColor: '#0ff1ce',
  card: '#14171c',
  cardBorder: '#20242b',
  glow: 'rgba(0, 255, 255, 0.15)',

  neutral: {
    50: '#f8f9fa',
    100: '#e6e8ea',
    200: '#c8cdd2',
    300: '#a6adb5',
    400: '#858d97',
    500: '#6b7280',
    600: '#545b66',
    700: '#3d424c',
    800: '#20242b',
    900: '#14171c',
    950: '#0a0c10',
  },

  primary: {
    50: '#e5feff',
    100: '#ccfdff',
    200: '#99fbff',
    300: '#66f9ff',
    400: '#33f6ff',
    500: '#00f0ff',
    600: '#00c0cc',
    700: '#009099',
    800: '#006066',
    900: '#003033',
  },

  accent: {
    50: '#e5fffe',
    100: '#ccfffd',
    200: '#99fffb',
    300: '#66fff9',
    400: '#33fff7',
    500: '#0ff1ce',
    600: '#0cc1a5',
    700: '#09917c',
    800: '#066052',
    900: '#033029',
  },

  status: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },

  weather: {
    clear: '#10b981',
    cloudy: '#f59e0b',
    storm: '#ef4444',
    degraded: '#f97316',
  },
};

export const glowStyles = {
  primary: `0 0 20px ${spaceOpsBlack.glow}`,
  strong: `0 0 30px rgba(0, 240, 255, 0.3)`,
  pulse: '0 0 40px rgba(0, 240, 255, 0.2)',
};
