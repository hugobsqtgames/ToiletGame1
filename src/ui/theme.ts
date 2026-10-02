/** Design tokens. One place for colors, fonts, radii and shadows. */
export const colors = {
  ink: '#1D2340',
  inkSoft: '#4A5275',
  white: '#FFFFFF',
  paper: '#FFF9EE',
  panel: '#FFFFFF',
  panelAlt: '#F2F5FF',
  line: '#E3E8F7',
  primary: '#2B7BFF',
  primaryDark: '#1A55C7',
  play: '#3BD16F',
  playDark: '#1F9C4C',
  gold: '#FFC83D',
  goldDark: '#D9921A',
  gem: '#C14BFF',
  gemDark: '#8722C4',
  danger: '#FF4D5E',
  dangerDark: '#C92E3D',
  warn: '#FFB020',
  warnDark: '#D9841A',
  purple: '#8B5CFF',
  purpleDark: '#5E35D6',
  teal: '#22D3C5',
  scrim: 'rgba(17, 22, 48, 0.62)',
  rarity: { common: '#9AA4B8', rare: '#2FA8FF', epic: '#B05CFF', legendary: '#FFB300' },
} as const;

export const fonts = {
  display: 'LilitaOne_400Regular',
  body: 'Nunito_800ExtraBold',
  bold: 'Nunito_900Black',
  regular: 'Nunito_700Bold',
} as const;

export const radius = { s: 10, m: 16, l: 24, xl: 32 } as const;

export const shadow = {
  shadowColor: '#0B1030',
  shadowOpacity: 0.22,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 5 },
  elevation: 6,
} as const;

/** Text outline used on titles over the 3D scene. */
export const textOutline = {
  textShadowColor: 'rgba(16, 20, 50, 0.55)',
  textShadowOffset: { width: 0, height: 3 },
  textShadowRadius: 0.5,
} as const;
