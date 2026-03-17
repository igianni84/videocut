import { describe, expect, it } from "vitest"

import { cn } from "./utils"

describe("cn utility", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible")
  })

  it("merges tailwind conflicts", () => {
    expect(cn("px-4", "px-6")).toBe("px-6")
  })
})
