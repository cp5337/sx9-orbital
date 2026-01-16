export const animations = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.3 },
  },

  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4 },
  },

  scaleIn: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.3 },
  },

  glow: {
    animate: {
      boxShadow: [
        '0 0 0 0 rgba(0, 240, 255, 0.0)',
        '0 0 0 20px rgba(0, 240, 255, 0.2)',
        '0 0 0 40px rgba(0, 240, 255, 0.0)',
      ],
    },
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },

  pulse: {
    animate: {
      scale: [1, 1.05, 1],
      opacity: [0.8, 1, 0.8],
    },
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },

  scanRing: {
    animate: {
      boxShadow: [
        '0 0 0 0 rgba(78, 205, 196, 0.0)',
        '0 0 0 40px rgba(78, 205, 196, 0.15)',
        '0 0 0 0 rgba(78, 205, 196, 0.0)',
      ],
    },
    transition: {
      duration: 3.6,
      repeat: Infinity,
    },
  },
};
