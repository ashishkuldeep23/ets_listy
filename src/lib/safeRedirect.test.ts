import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/safeRedirect";

describe("safeNextPath", () => {
  it("allows same-site paths", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/folders/123")).toBe("/folders/123");
    expect(safeNextPath("/share/abc?x=1")).toBe("/share/abc?x=1");
  });

  it("rejects anything that could leave the site", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "http://evil.com",
      "javascript:alert(1)",
      "evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "",
      null,
      undefined,
      { path: "/" },
      "/" + "x".repeat(600),
    ]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//evil.com", "/login")).toBe("/login");
  });
});
