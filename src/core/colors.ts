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
// xterm Cell Color Conversion (using helper methods per xterm.js docs)
// =============================================================================

interface FgCell {
  isFgDefault(): boolean;
  isFgPalette(): boolean;
  isFgRGB(): boolean;
  getFgColor(): number;
}

interface BgCell {
  isBgDefault(): boolean;
  isBgPalette(): boolean;
  isBgRGB(): boolean;
  getBgColor(): number;
}

export function cellFgToAnsi(cell: FgCell): string {
  if (cell.isFgDefault()) return "";

  const color = cell.getFgColor();

  if (cell.isFgRGB()) {
    // RGB mode: color is 0xRRGGBB
    return ansi.fgRgb((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff);
  }

  if (cell.isFgPalette()) {
    // Palette mode: 0-255
    if (color < 8) {
      // Standard colors (30-37)
      return `${CSI}${30 + color}m`;
    }
    if (color < 16) {
      // Bright colors (90-97)
      return `${CSI}${90 + (color - 8)}m`;
    }
    // 256-color palette
    return ansi.fg(color);
  }

  return "";
}

export function cellBgToAnsi(cell: BgCell): string {
  if (cell.isBgDefault()) return "";

  const color = cell.getBgColor();

  if (cell.isBgRGB()) {
    // RGB mode: color is 0xRRGGBB
    return ansi.bgRgb((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff);
  }

  if (cell.isBgPalette()) {
    // Palette mode: 0-255
    if (color < 8) {
      // Standard colors (40-47)
      return `${CSI}${40 + color}m`;
    }
    if (color < 16) {
      // Bright colors (100-107)
      return `${CSI}${100 + (color - 8)}m`;
    }
    // 256-color palette
    return ansi.bg(color);
  }

  return "";
}

// Re-export chalk for direct use
export { chalk };
