import { describe, it, expect } from "vitest"
import {
  validateFileType,
  validateFileSize,
  validateDuration,
  getExtensionFromMime,
  formatFileSize,
  formatDuration,
  MAX_FILE_SIZE_BYTES,
} from "./validation"

describe("validateFileType", () => {
  it("accepts video/mp4", () => {
    expect(validateFileType("video/mp4")).toBeNull()
  })

  it("accepts video/quicktime", () => {
    expect(validateFileType("video/quicktime")).toBeNull()
  })

  it("accepts video/webm", () => {
    expect(validateFileType("video/webm")).toBeNull()
  })

  it("rejects text/plain", () => {
    expect(validateFileType("text/plain")).toContain("not supported")
  })

  it("rejects image/png", () => {
    expect(validateFileType("image/png")).toContain("not supported")
  })

  it("rejects video/avi", () => {
    expect(validateFileType("video/avi")).toContain("not supported")
  })
})

describe("validateFileSize", () => {
  it("accepts 1 MB file", () => {
    expect(validateFileSize(1024 * 1024)).toBeNull()
  })

  it("accepts exactly 500 MB", () => {
    expect(validateFileSize(MAX_FILE_SIZE_BYTES)).toBeNull()
  })

  it("rejects file over 500 MB", () => {
    expect(validateFileSize(MAX_FILE_SIZE_BYTES + 1)).toContain("too large")
  })

  it("rejects empty file", () => {
    expect(validateFileSize(0)).toContain("empty")
  })

  it("rejects negative size", () => {
    expect(validateFileSize(-1)).toContain("empty")
  })
})

describe("validateDuration", () => {
  it("accepts 30s for free tier", () => {
    expect(validateDuration(30, "free")).toBeNull()
  })

  it("accepts exactly 60s for free tier", () => {
    expect(validateDuration(60, "free")).toBeNull()
  })

  it("rejects 61s for free tier", () => {
    const result = validateDuration(61, "free")
    expect(result).toContain("61s")
    expect(result).toContain("60s")
  })

  it("accepts 120s for pro tier", () => {
    expect(validateDuration(120, "pro")).toBeNull()
  })

  it("accepts exactly 180s for pro tier", () => {
    expect(validateDuration(180, "pro")).toBeNull()
  })

  it("rejects 181s for pro tier", () => {
    const result = validateDuration(181, "pro")
    expect(result).toContain("180s")
  })
})

describe("getExtensionFromMime", () => {
  it("returns .mp4 for video/mp4", () => {
    expect(getExtensionFromMime("video/mp4")).toBe(".mp4")
  })

  it("returns .mov for video/quicktime", () => {
    expect(getExtensionFromMime("video/quicktime")).toBe(".mov")
  })

  it("returns .webm for video/webm", () => {
    expect(getExtensionFromMime("video/webm")).toBe(".webm")
  })

  it("defaults to .mp4 for unknown type", () => {
    expect(getExtensionFromMime("video/unknown")).toBe(".mp4")
  })
})

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(512)).toBe("512 B")
  })

  it("formats KB", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB")
  })

  it("formats MB", () => {
    expect(formatFileSize(15 * 1024 * 1024)).toBe("15.0 MB")
  })

  it("formats GB", () => {
    expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe("1.50 GB")
  })
})

describe("formatDuration", () => {
  it("formats seconds only", () => {
    expect(formatDuration(45)).toBe("0:45")
  })

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2:05")
  })

  it("formats zero", () => {
    expect(formatDuration(0)).toBe("0:00")
  })

  it("pads single-digit seconds", () => {
    expect(formatDuration(63)).toBe("1:03")
  })
})
