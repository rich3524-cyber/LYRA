export const tokens = {
  colors: {
    background: {
      primary:   '#080808',
      secondary: '#0f0f0f',
      tertiary:  '#141414',
      hover:     '#1a1a1a',
      border:    '#222222',
      borderMid: '#333333',
    },
    text: {
      primary:   '#e2e2e2',
      secondary: '#888888',
      tertiary:  '#555555',
      inverse:   '#080808',
    },
    accent: {
      platinum:  '#d8d8d8',
      white:     '#f4f4f2',
      silver:    '#aaaaaa',
    },
    status: {
      success:   '#4ade80',
      warning:   '#fbbf24',
      error:     '#f87171',
      info:      '#60a5fa',
    },
  },
  typography: {
    display: '"Instrument Serif", "Playfair Display", Georgia, serif',
    sans:    '"DM Sans", "Geist", system-ui, sans-serif',
    mono:    '"Geist Mono", "JetBrains Mono", monospace',
  },
  spacing: {
    1: '4px',  2: '8px',   3: '12px', 4: '16px',
    5: '20px', 6: '24px',  8: '32px', 10: '40px',
    12: '48px', 16: '64px',
  },
  radius: {
    sm:   '6px',
    md:   '10px',
    lg:   '14px',
    xl:   '20px',
    full: '9999px',
  },
  animation: {
    fast:   '150ms',
    normal: '200ms',
    slow:   '300ms',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
} as const

export type Tokens = typeof tokens
