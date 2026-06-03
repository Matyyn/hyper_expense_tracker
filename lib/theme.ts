// Central theme palette. Two surfaces of truth:
//  - CSS variables in global.css drive the NativeWind semantic utility classes
//    (bg-app, bg-surface, text-ink, ...). Keep those in sync with the RGB triples
//    documented below.
//  - The hex palettes here are used for inline styles / icon colors / props that
//    can't use className (FontAwesome color, placeholderTextColor, etc.).

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

export interface ThemePalette {
  app: string;       // screen background
  surface: string;   // card background
  elevated: string;  // inputs / inner panels
  line: string;      // borders / dividers
  ink: string;       // primary text
  muted: string;     // secondary text
  faint: string;     // tertiary text / disabled icons
  scrim: string;     // modal overlay (kept dark in both themes)
  accent: string;    // emerald accent (same in both themes)
}

export const LIGHT_PALETTE: ThemePalette = {
  app: '#fafaf9',      // stone-50
  surface: '#ffffff',
  elevated: '#f5f5f4', // stone-100
  line: '#e7e5e4',     // stone-200
  ink: '#1c1917',      // stone-900
  muted: '#57534e',    // stone-600
  faint: '#a8a29e',    // stone-400
  scrim: 'rgba(0,0,0,0.5)',
  accent: '#10b981',
};

export const DARK_PALETTE: ThemePalette = {
  app: '#000000',
  surface: '#1c1917',  // stone-900
  elevated: '#000000',
  line: '#292524',     // stone-800
  ink: '#ffffff',
  muted: '#a8a29e',    // stone-400
  faint: '#57534e',    // stone-600
  scrim: 'rgba(0,0,0,0.8)',
  accent: '#34d399',
};

export const getPalette = (scheme: ResolvedScheme): ThemePalette =>
  scheme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;

// RGB triples for NativeWind's vars() — these feed the semantic utility classes
// (bg-app, text-ink, ...) which resolve to rgb(var(--color-x) / <alpha-value>).
// Applying these via vars() on a wrapper View is the most reliable way to switch
// themes at runtime on both native and web. Keep in sync with global.css.
export const CSS_VARS: Record<ResolvedScheme, Record<string, string>> = {
  light: {
    '--color-app': '250 250 249',
    '--color-surface': '255 255 255',
    '--color-elevated': '245 245 244',
    '--color-line': '231 229 228',
    '--color-ink': '28 25 23',
    '--color-muted': '87 83 74',
    '--color-faint': '168 162 158',
  },
  dark: {
    '--color-app': '0 0 0',
    '--color-surface': '28 25 23',
    '--color-elevated': '0 0 0',
    '--color-line': '41 37 36',
    '--color-ink': '255 255 255',
    '--color-muted': '168 162 158',
    '--color-faint': '87 83 74',
  },
};
