import { describe, expect, test } from "bun:test";
import {
  ansi,
  borderColors,
  CSI,
  cellBgToAnsi,
  cellFgToAnsi,
  getBorderChalk,
  getBorderColor,
  style,
} from "../src/infra/colors";

describe("colors", () => {
  describe("CSI constant", () => {
    test("is the ANSI Control Sequence Introducer", () => {
      expect(CSI).toBe("\x1b[");
    });
  });

  describe("ansi escape sequences", () => {
    describe("screen control", () => {
      test("enterAltScreen switches to alternate screen buffer", () => {
        expect(ansi.enterAltScreen).toBe(`${CSI}?1049h`);
      });

      test("leaveAltScreen returns to main screen buffer", () => {
        expect(ansi.leaveAltScreen).toBe(`${CSI}?1049l`);
      });

      test("clearScreen clears screen and moves cursor home", () => {
        expect(ansi.clearScreen).toBe(`${CSI}2J${CSI}H`);
      });

      test("hideCursor hides the cursor", () => {
        expect(ansi.hideCursor).toBe(`${CSI}?25l`);
      });

      test("showCursor shows the cursor", () => {
        expect(ansi.showCursor).toBe(`${CSI}?25h`);
      });

      test("moveTo generates cursor positioning sequence", () => {
        expect(ansi.moveTo(1, 1)).toBe(`${CSI}1;1H`);
        expect(ansi.moveTo(10, 20)).toBe(`${CSI}10;20H`);
      });
    });

    describe("text styles", () => {
      test("reset clears all styles", () => {
        expect(ansi.reset).toBe(`${CSI}0m`);
      });

      test("bold makes text bold", () => {
        expect(ansi.bold).toBe(`${CSI}1m`);
      });

      test("dim makes text dim/faint", () => {
        expect(ansi.dim).toBe(`${CSI}2m`);
      });

      test("italic makes text italic", () => {
        expect(ansi.italic).toBe(`${CSI}3m`);
      });

      test("underline makes text underlined", () => {
        expect(ansi.underline).toBe(`${CSI}4m`);
      });

      test("inverse inverts foreground/background", () => {
        expect(ansi.inverse).toBe(`${CSI}7m`);
      });

      test("strikethrough makes text crossed out", () => {
        expect(ansi.strikethrough).toBe(`${CSI}9m`);
      });
    });

    describe("256-color palette", () => {
      test("fg generates foreground color sequence", () => {
        expect(ansi.fg(0)).toBe(`${CSI}38;5;0m`);
        expect(ansi.fg(15)).toBe(`${CSI}38;5;15m`);
        expect(ansi.fg(255)).toBe(`${CSI}38;5;255m`);
      });

      test("bg generates background color sequence", () => {
        expect(ansi.bg(0)).toBe(`${CSI}48;5;0m`);
        expect(ansi.bg(15)).toBe(`${CSI}48;5;15m`);
        expect(ansi.bg(255)).toBe(`${CSI}48;5;255m`);
      });
    });

    describe("true color RGB", () => {
      test("fgRgb generates RGB foreground color sequence", () => {
        expect(ansi.fgRgb(255, 0, 0)).toBe(`${CSI}38;2;255;0;0m`);
        expect(ansi.fgRgb(0, 255, 0)).toBe(`${CSI}38;2;0;255;0m`);
        expect(ansi.fgRgb(128, 128, 128)).toBe(`${CSI}38;2;128;128;128m`);
      });

      test("bgRgb generates RGB background color sequence", () => {
        expect(ansi.bgRgb(255, 0, 0)).toBe(`${CSI}48;2;255;0;0m`);
        expect(ansi.bgRgb(0, 255, 0)).toBe(`${CSI}48;2;0;255;0m`);
        expect(ansi.bgRgb(128, 128, 128)).toBe(`${CSI}48;2;128;128;128m`);
      });
    });
  });

  describe("style chalk functions", () => {
    test("exports status colors", () => {
      expect(typeof style.error).toBe("function");
      expect(typeof style.warning).toBe("function");
      expect(typeof style.success).toBe("function");
      expect(typeof style.info).toBe("function");
      expect(typeof style.muted).toBe("function");
    });

    test("exports UI element styles", () => {
      expect(typeof style.header).toBe("function");
      expect(typeof style.headerAccent).toBe("function");
      expect(typeof style.label).toBe("function");
      expect(typeof style.value).toBe("function");
      expect(typeof style.dim).toBe("function");
    });

    test("exports agent/task status styles", () => {
      expect(typeof style.running).toBe("function");
      expect(typeof style.stopped).toBe("function");
      expect(typeof style.blocked).toBe("function");
      expect(typeof style.done).toBe("function");
      expect(typeof style.pending).toBe("function");
    });

    test("exports semantic element styles", () => {
      expect(typeof style.agentName).toBe("function");
      expect(typeof style.taskId).toBe("function");
      expect(typeof style.command).toBe("function");
      expect(typeof style.path).toBe("function");
      expect(typeof style.timestamp).toBe("function");
    });

    test("exports highlight styles", () => {
      expect(typeof style.highlight).toBe("function");
      expect(typeof style.accent).toBe("function");
      expect(typeof style.link).toBe("function");
    });

    test("chalk functions produce strings", () => {
      expect(typeof style.error("test")).toBe("string");
      expect(typeof style.success("test")).toBe("string");
      expect(typeof style.header("test")).toBe("string");
    });
  });

  describe("borderColors", () => {
    test("exports all border states", () => {
      expect(borderColors.default).toBeDefined();
      expect(borderColors.error).toBeDefined();
      expect(borderColors.focused).toBeDefined();
      expect(borderColors.selected).toBeDefined();
      expect(borderColors.running).toBeDefined();
    });
  });

  describe("getBorderChalk", () => {
    test("returns chalk instance for each border state", () => {
      expect(typeof getBorderChalk("default")).toBe("function");
      expect(typeof getBorderChalk("error")).toBe("function");
      expect(typeof getBorderChalk("focused")).toBe("function");
      expect(typeof getBorderChalk("selected")).toBe("function");
      expect(typeof getBorderChalk("running")).toBe("function");
    });

    test("chalk instances produce strings", () => {
      expect(typeof getBorderChalk("default")("test")).toBe("string");
      expect(typeof getBorderChalk("error")("test")).toBe("string");
    });
  });

  describe("getBorderColor", () => {
    test("returns raw ANSI color code for default state", () => {
      expect(getBorderColor("default")).toBe("38;5;240");
    });

    test("returns raw ANSI color code for error state", () => {
      expect(getBorderColor("error")).toBe("38;5;196");
    });

    test("returns raw ANSI color code for focused state", () => {
      expect(getBorderColor("focused")).toBe("38;5;39");
    });

    test("returns raw ANSI color code for selected state", () => {
      expect(getBorderColor("selected")).toBe("38;5;214");
    });

    test("returns raw ANSI color code for running state", () => {
      expect(getBorderColor("running")).toBe("38;5;82");
    });
  });

  describe("cellFgToAnsi", () => {
    test("returns empty string for default foreground", () => {
      const cell = {
        isFgDefault: () => true,
        isFgPalette: () => false,
        isFgRGB: () => false,
        getFgColor: () => 0,
      };
      expect(cellFgToAnsi(cell)).toBe("");
    });

    test("converts RGB color to ANSI sequence", () => {
      const cell = {
        isFgDefault: () => false,
        isFgPalette: () => false,
        isFgRGB: () => true,
        getFgColor: () => 0xff0000, // Red
      };
      expect(cellFgToAnsi(cell)).toBe(`${CSI}38;2;255;0;0m`);
    });

    test("converts standard palette color (0-7) to 30-37 sequence", () => {
      const cell = {
        isFgDefault: () => false,
        isFgPalette: () => true,
        isFgRGB: () => false,
        getFgColor: () => 1, // Standard red
      };
      expect(cellFgToAnsi(cell)).toBe(`${CSI}31m`);
    });

    test("converts bright palette color (8-15) to 90-97 sequence", () => {
      const cell = {
        isFgDefault: () => false,
        isFgPalette: () => true,
        isFgRGB: () => false,
        getFgColor: () => 9, // Bright red
      };
      expect(cellFgToAnsi(cell)).toBe(`${CSI}91m`);
    });

    test("converts 256-color palette (16-255) to 38;5;n sequence", () => {
      const cell = {
        isFgDefault: () => false,
        isFgPalette: () => true,
        isFgRGB: () => false,
        getFgColor: () => 196, // Bright red in 256 palette
      };
      expect(cellFgToAnsi(cell)).toBe(`${CSI}38;5;196m`);
    });

    test("returns empty string for non-default, non-palette, non-RGB", () => {
      const cell = {
        isFgDefault: () => false,
        isFgPalette: () => false,
        isFgRGB: () => false,
        getFgColor: () => 0,
      };
      expect(cellFgToAnsi(cell)).toBe("");
    });
  });

  describe("cellBgToAnsi", () => {
    test("returns empty string for default background", () => {
      const cell = {
        isBgDefault: () => true,
        isBgPalette: () => false,
        isBgRGB: () => false,
        getBgColor: () => 0,
      };
      expect(cellBgToAnsi(cell)).toBe("");
    });

    test("converts RGB color to ANSI sequence", () => {
      const cell = {
        isBgDefault: () => false,
        isBgPalette: () => false,
        isBgRGB: () => true,
        getBgColor: () => 0x00ff00, // Green
      };
      expect(cellBgToAnsi(cell)).toBe(`${CSI}48;2;0;255;0m`);
    });

    test("converts standard palette color (0-7) to 40-47 sequence", () => {
      const cell = {
        isBgDefault: () => false,
        isBgPalette: () => true,
        isBgRGB: () => false,
        getBgColor: () => 2, // Standard green
      };
      expect(cellBgToAnsi(cell)).toBe(`${CSI}42m`);
    });

    test("converts bright palette color (8-15) to 100-107 sequence", () => {
      const cell = {
        isBgDefault: () => false,
        isBgPalette: () => true,
        isBgRGB: () => false,
        getBgColor: () => 10, // Bright green
      };
      expect(cellBgToAnsi(cell)).toBe(`${CSI}102m`);
    });

    test("converts 256-color palette (16-255) to 48;5;n sequence", () => {
      const cell = {
        isBgDefault: () => false,
        isBgPalette: () => true,
        isBgRGB: () => false,
        getBgColor: () => 46, // Bright green in 256 palette
      };
      expect(cellBgToAnsi(cell)).toBe(`${CSI}48;5;46m`);
    });

    test("returns empty string for non-default, non-palette, non-RGB", () => {
      const cell = {
        isBgDefault: () => false,
        isBgPalette: () => false,
        isBgRGB: () => false,
        getBgColor: () => 0,
      };
      expect(cellBgToAnsi(cell)).toBe("");
    });
  });

  describe("RGB color extraction", () => {
    test("correctly extracts R, G, B components from hex color", () => {
      // Test by verifying the output sequence contains correct values
      const cell = {
        isFgDefault: () => false,
        isFgPalette: () => false,
        isFgRGB: () => true,
        getFgColor: () => 0x102030, // R=16, G=32, B=48
      };
      expect(cellFgToAnsi(cell)).toBe(`${CSI}38;2;16;32;48m`);
    });

    test("handles maximum color values (0xFFFFFF)", () => {
      const cell = {
        isFgDefault: () => false,
        isFgPalette: () => false,
        isFgRGB: () => true,
        getFgColor: () => 0xffffff, // White
      };
      expect(cellFgToAnsi(cell)).toBe(`${CSI}38;2;255;255;255m`);
    });

    test("handles minimum color values (0x000000)", () => {
      const cell = {
        isFgDefault: () => false,
        isFgPalette: () => false,
        isFgRGB: () => true,
        getFgColor: () => 0x000000, // Black
      };
      expect(cellFgToAnsi(cell)).toBe(`${CSI}38;2;0;0;0m`);
    });
  });
});
