export const plannerTokens = {
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
  },
  shape: {
    control: 12,
    surface: 18,
    panel: 24,
    hero: 30,
  },
  size: {
    controlSm: 32,
    controlMd: 40,
    controlLg: 48,
    touchMin: 44,
  },
  color: {
    surface: '#FFFFFF',
    surfaceSubtle: '#F7F7F8',
    surfaceRaised: '#FFFFFF',
    text: '#171719',
    textSecondary: '#6B6B70',
    line: '#E7E7EA',
    primary: '#2563EB',
    primaryText: '#FFFFFF',
    ready: '#159455',
    attention: '#D97706',
    danger: '#DC2626',
    info: '#2563EB',
  },
  shadow: {
    surface: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.05)',
    panel: '0 16px 48px rgba(0,0,0,.12)',
  },
  motion: {
    fast: 120,
    normal: 180,
    slow: 260,
  },
} as const;

export type PlannerTokens = typeof plannerTokens;
