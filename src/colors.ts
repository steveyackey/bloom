// =============================================================================
// Centralized Colors for Bloom (using Chalk)
// =============================================================================

import chalk, { type ChalkInstance } from "chalk";

const ESC = "\x1b";
export const CSI = `${ESC}[`;

// =============================================================================
// ANSI Escape Sequences (screen control only - not colors)
// =============================================================================

export const ansi = {
  // Screen control
  enterAltScreen: `${CSI}?1049h`,
  leaveAltScreen: `${CSI}?1049l`,
  clearScreen: `${CSI}2J${CSI}H`,
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  moveTo: (row: number, col: number) => `${CSI}${row};${col}H`,

  // Reset only
  reset: `${CSI}0m`,

  // Text styles (for xterm cell rendering compatibility)
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  italic: `${CSI}3m`,
  underline: `${CSI}4m`,
  inverse: `${CSI}7m`,
  strikethrough: `${CSI}9m`,

  // 256-color palette (for xterm cell rendering)
  fg: (n: number) => `${CSI}38;5;${n}m`,
  bg: (n: number) => `${CSI}48;5;${n}m`,

  // True color RGB (for xterm cell rendering)
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
// Chalk-based styling for beautiful output
// =============================================================================

export const style = {
  // Status colors
  error: chalk.red,
  warning: chalk.yellow,
  success: chalk.green,
  info: chalk.cyan,
  muted: chalk.gray,

  // UI elements
  header: chalk.bold.cyan,
  headerAccent: chalk.bold.magenta,
  label: chalk.bold.white,
  value: chalk.white,
  dim: chalk.dim,

  // Agent/task status
  running: chalk.green,
  stopped: chalk.gray,
  blocked: chalk.red,
  done: chalk.green,
  pending: chalk.yellow,

  // Semantic elements
  agentName: chalk.bold.cyan,
  taskId: chalk.yellow,
  command: chalk.dim.italic,
  path: chalk.blue,
  timestamp: chalk.gray,

  // Highlights
  highlight: chalk.bold.yellow,
  accent: chalk.magenta,
  link: chalk.underline.blue,
};

// =============================================================================
// Border Colors (chalk instances for TUI)
// =============================================================================

export const borderColors = {
  default: chalk.gray,
  error: chalk.red,
  focused: chalk.cyan.bold,
  selected: chalk.yellow,
  running: chalk.green,
};

export type BorderState = keyof typeof borderColors;

export function getBorderChalk(state: BorderState): ChalkInstance {
  return borderColors[state];
}

// Legacy function for compatibility - returns raw ANSI code
export function getBorderColor(state: BorderState): string {
  const colorMap: Record<BorderState, string> = {
    default: "38;5;240", // Gray
    error: "38;5;196", // Red
    focused: "38;5;39", // Bright cyan
    selected: "38;5;214", // Orange/gold
    running: "38;5;82", // Green
  };
  return colorMap[state];
}

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

// Re-export chalk for direct use
export { chalk };
