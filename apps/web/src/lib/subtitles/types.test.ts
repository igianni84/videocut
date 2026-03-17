import { describe, it, expect } from "vitest"

import {
  DEFAULT_SUBTITLE_OPTIONS,
  SUBTITLE_FONTS,
  SUBTITLE_LANGUAGES,
  SUBTITLE_POSITIONS,
} from "./types"

describe("Subtitle types", () => {
  it("DEFAULT_SUBTITLE_OPTIONS has required fields", () => {
    expect(DEFAULT_SUBTITLE_OPTIONS.enabled).toBe(true)
    expect(DEFAULT_SUBTITLE_OPTIONS.font).toBe("Montserrat")
    expect(DEFAULT_SUBTITLE_OPTIONS.size).toBe(48)
    expect(DEFAULT_SUBTITLE_OPTIONS.colorBase).toBe("#FFFFFF")
    expect(DEFAULT_SUBTITLE_OPTIONS.colorHighlight).toBe("#FFFF00")
    expect(DEFAULT_SUBTITLE_OPTIONS.position).toBe("bottom")
    expect(DEFAULT_SUBTITLE_OPTIONS.outline).toBe(2)
    expect(DEFAULT_SUBTITLE_OPTIONS.shadow).toBe(1)
    expect(DEFAULT_SUBTITLE_OPTIONS.language).toBe("auto")
  })

  it("SUBTITLE_FONTS contains expected fonts", () => {
    expect(SUBTITLE_FONTS).toContain("Montserrat")
    expect(SUBTITLE_FONTS).toContain("Inter")
    expect(SUBTITLE_FONTS).toContain("Roboto")
    expect(SUBTITLE_FONTS.length).toBeGreaterThanOrEqual(5)
  })

  it("SUBTITLE_POSITIONS contains top, center, bottom", () => {
    expect(SUBTITLE_POSITIONS).toEqual(["top", "center", "bottom"])
  })

  it("SUBTITLE_LANGUAGES contains auto and 6 languages", () => {
    expect(SUBTITLE_LANGUAGES.length).toBe(7)
    expect(SUBTITLE_LANGUAGES[0].code).toBe("auto")
    const codes = SUBTITLE_LANGUAGES.map((l) => l.code)
    expect(codes).toContain("it")
    expect(codes).toContain("en")
    expect(codes).toContain("es")
    expect(codes).toContain("fr")
    expect(codes).toContain("de")
    expect(codes).toContain("pt")
  })
})
