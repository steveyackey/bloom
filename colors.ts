// =============================================================================
// Centralized ANSI Color Codes for Bloom
// =============================================================================

// Base escape sequences
export const ESC = '\x1b';
export const CSI = `${ESC}[`;

// =============================================================================
// ANSI Escape Sequences
// =============================================================================

export const ansi = {
  // Screen control
  enterAltScreen: `${CSI}?1049h`,
  leaveAltScreen: `${CSI}?1049l`,
  clearScreen: `${CSI}2J${CSI}H`,
  clearScrollback: `${CSI}3J`,
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  moveTo: (row: number, col: number) => `${CSI}${row};${col}H`,

  // Text styles
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  italic: `${CSI}3m`,
  underline: `${CSI}4m`,
  inverse: `${CSI}7m`,
  strikethrough: `${CSI}9m`,

  // 256-color palette
  fg: (n: number) => `${CSI}38;5;${n}m`,
  bg: (n: number) => `${CSI}48;5;${n}m`,

  // True color (RGB)
  fgRgb: (r: number, g: number, b: number) => `${CSI}38;2;${r};${g};${b}m`,
  bgRgb: (r: number, g: number, b: number) => `${CSI}48;2;${r};${g};${b}m`,
};

// =============================================================================
// Color Mode Constants (for xterm cell parsing)
// =============================================================================

export const enum ColorMode {
  DEFAULT = 0,
  PALETTE_16 = 16,
  PALETTE_256 = 256,
  RGB = 16777216,
}

// =============================================================================
// Standard Color Codes
// =============================================================================

export const colors = {
  // Basic foreground colors (30-37)
  black: `${CSI}30m`,
  red: `${CSI}31m`,
  green: `${CSI}32m`,
  yellow: `${CSI}33m`,
  blue: `${CSI}34m`,
  magenta: `${CSI}35m`,
  cyan: `${CSI}36m`,
  white: `${CSI}37m`,

  // Bright foreground colors (90-97)
  brightBlack: `${CSI}90m`,   // Gray
  brightRed: `${CSI}91m`,
  brightGreen: `${CSI}92m`,
  brightYellow: `${CSI}93m`,
  brightBlue: `${CSI}94m`,
  brightMagenta: `${CSI}95m`,
  brightCyan: `${CSI}96m`,
  brightWhite: `${CSI}97m`,

  // Basic background colors (40-47)
  bgBlack: `${CSI}40m`,
  bgRed: `${CSI}41m`,
  bgGreen: `${CSI}42m`,
  bgYellow: `${CSI}43m`,
  bgBlue: `${CSI}44m`,
  bgMagenta: `${CSI}45m`,
  bgCyan: `${CSI}46m`,
  bgWhite: `${CSI}47m`,

  // Bright background colors (100-107)
  bgBrightBlack: `${CSI}100m`,
  bgBrightRed: `${CSI}101m`,
  bgBrightGreen: `${CSI}102m`,
  bgBrightYellow: `${CSI}103m`,
  bgBrightBlue: `${CSI}104m`,
  bgBrightMagenta: `${CSI}105m`,
  bgBrightCyan: `${CSI}106m`,
  bgBrightWhite: `${CSI}107m`,
};

// =============================================================================
// Semantic Colors (Application-specific color meanings)
// =============================================================================

export const semantic = {
  // Status colors
  error: colors.brightRed,
  warning: colors.brightYellow,
  success: colors.brightGreen,
  info: colors.brightCyan,
  muted: colors.brightBlack,  // Gray

  // UI element colors
  header: {
    bg: `${CSI}48;5;19m`,    // Dark blue background
    fg: colors.brightWhite,
    style: ansi.bold,
  },
  separator: colors.blue,

  // Border colors based on state
  border: {
    default: '90',   // Gray
    error: '31',     // Red
    focused: '32',   // Green
    selected: '33',  // Yellow
    running: '36',   // Cyan
  },

  // Agent/streaming output colors
  tool: colors.brightCyan,
  toolResult: colors.brightBlack,
  session: colors.brightBlack,
  cost: colors.brightBlack,
  heartbeat: colors.brightBlack,
  timeout: colors.brightRed,
};

// =============================================================================
// Logger Colors
// =============================================================================

export const logColors = {
  debug: colors.brightBlack,
  info: colors.brightBlue,
  warn: colors.brightYellow,
  error: colors.brightRed,
};

// =============================================================================
// Helper Functions for xterm Cell Color Conversion
// =============================================================================

export function cellFgToAnsi(cell: any): string {
  const mode = cell.getFgColorMode();
  const color = cell.getFgColor();
  if (mode === ColorMode.DEFAULT || mode === 0) return '';
  if (mode === ColorMode.PALETTE_16 || mode === 16) {
    return color < 8 ? `${CSI}${30 + color}m` : `${CSI}${90 + (color - 8)}m`;
  }
  if (mode === ColorMode.PALETTE_256 || mode === 256) return ansi.fg(color);
  if (mode === ColorMode.RGB || mode >= 16777216) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return ansi.fgRgb(r, g, b);
  }
  return '';
}

export function cellBgToAnsi(cell: any): string {
  const mode = cell.getBgColorMode();
  const color = cell.getBgColor();
  if (mode === ColorMode.DEFAULT || mode === 0) return '';
  if (mode === ColorMode.PALETTE_16 || mode === 16) {
    return color < 8 ? `${CSI}${40 + color}m` : `${CSI}${100 + (color - 8)}m`;
  }
  if (mode === ColorMode.PALETTE_256 || mode === 256) return ansi.bg(color);
  if (mode === ColorMode.RGB || mode >= 16777216) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return ansi.bgRgb(r, g, b);
  }
  return '';
}

// =============================================================================
// Convenience Functions
// =============================================================================

/** Wrap text in a color and reset */
export function colorize(text: string, color: string): string {
  return `${color}${text}${ansi.reset}`;
}

/** Get border color code by state name */
export function getBorderColor(state: 'default' | 'error' | 'focused' | 'selected' | 'running'): string {
  return semantic.border[state];
}
