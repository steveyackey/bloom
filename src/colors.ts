// =============================================================================
// Centralized ANSI Color Codes for Bloom
// =============================================================================

const ESC = "\x1b";
export const CSI = `${ESC}[`;

// =============================================================================
// ANSI Escape Sequences
// =============================================================================

export const ansi = {
  // Screen control
  enterAltScreen: `${CSI}?1049h`,
  leaveAltScreen: `${CSI}?1049l`,
  clearScreen: `${CSI}2J${CSI}H`,
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

export enum ColorMode {
  DEFAULT = 0,
  PALETTE_16 = 16,
  PALETTE_256 = 256,
  RGB = 16777216,
}

// =============================================================================
// Semantic Colors (Application-specific meanings) - COLORS REMOVED
// =============================================================================

export const semantic = {
  // Status - no colors
  error: "",
  warning: "",
  success: "",
  info: "",
  muted: "",

  // UI elements - no colors
  header: {
    bg: "",
    fg: "",
    style: "",
  },
  separator: "",

  // Border states - all use default (white/no color)
  border: {
    default: "37",
    error: "37",
    focused: "37",
    selected: "37",
    running: "37",
  },

  // Agent output - no colors
  tool: "",
  toolResult: "",
  session: "",
  cost: "",
  heartbeat: "",
  timeout: "",
};

// =============================================================================
// xterm Cell Color Conversion
// =============================================================================

export function cellFgToAnsi(cell: { getFgColorMode(): number; getFgColor(): number }): string {
  const mode = cell.getFgColorMode();
  const color = cell.getFgColor();

  if (mode === ColorMode.DEFAULT) return "";
  if (mode === ColorMode.PALETTE_16) {
    return color < 8 ? `${CSI}${30 + color}m` : `${CSI}${90 + (color - 8)}m`;
  }
  if (mode === ColorMode.PALETTE_256) return ansi.fg(color);
  if (mode >= ColorMode.RGB) {
    return ansi.fgRgb((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff);
  }
  return "";
}

export function cellBgToAnsi(cell: { getBgColorMode(): number; getBgColor(): number }): string {
  const mode = cell.getBgColorMode();
  const color = cell.getBgColor();

  if (mode === ColorMode.DEFAULT) return "";
  if (mode === ColorMode.PALETTE_16) {
    return color < 8 ? `${CSI}${40 + color}m` : `${CSI}${100 + (color - 8)}m`;
  }
  if (mode === ColorMode.PALETTE_256) return ansi.bg(color);
  if (mode >= ColorMode.RGB) {
    return ansi.bgRgb((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff);
  }
  return "";
}

// =============================================================================
// Utility Functions
// =============================================================================

export function getBorderColor(state: keyof typeof semantic.border): string {
  return semantic.border[state];
}
