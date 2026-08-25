import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND, FEVER, STATUS } from "./tokens";

/**
 * Token discipline — 07_DESIGN_SYSTEM §7.3.
 *
 * The same rule the CI gate enforces (`pnpm check:tokens`), asserted here so a
 * local `vitest` run catches a collision before the gate does. Both read the CSS
 * rather than a duplicated table, because a test that restates the palette can
 * agree with itself while disagreeing with the product.
 */

const CSS = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");

function rootTokens(): Map<string, string> {
  const start = CSS.indexOf(":root {");
  const block = CSS.slice(start, CSS.indexOf("\n}", start)).replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map<string, string>();
  for (const line of block.split(/\r?\n/)) {
    const match = /^\s*--([\w-]+)\s*:\s*([^;]+);/.exec(line);
    if (match) tokens.set(match[1], match[2].trim().toUpperCase());
  }
  return tokens;
}

const TOKENS = rootTokens();
const hexes = (prefixes: string[]) =>
  [...TOKENS].filter(
    ([name, value]) =>
      /^#[0-9A-F]{6}$/.test(value) &&
      prefixes.some((p) => name === p || name.startsWith(`${p}-`)),
  );

describe("design tokens", () => {
  it("declares the §7.3 palette", () => {
    expect(TOKENS.get("brand-ink")).toBe("#0E1F1A");
    expect(TOKENS.get("brand-primary")).toBe("#0E1F1A");
    expect(TOKENS.get("brand-accent")).toBe("#D3F36B");
    expect(TOKENS.get("status-moving")).toBe("#2D7A9E");
    expect(TOKENS.get("status-waiting")).toBe("#C77D18");
    expect(TOKENS.get("status-attention")).toBe("#B3402B");
    expect(TOKENS.get("status-done")).toBe("#3E7A5B");
  });

  it("keeps brand and status as disjoint sets", () => {
    const brand = new Set(hexes(["brand", "surface", "bg", "border"]).map(([, hex]) => hex));
    const status = new Set(hexes(["status"]).map(([, hex]) => hex));
    expect(brand.size).toBeGreaterThan(0);
    expect(status.size).toBeGreaterThan(0);
    expect([...status].filter((hex) => brand.has(hex))).toEqual([]);
  });

  it("keeps brand and fever zones disjoint", () => {
    const brand = new Set(hexes(["brand", "surface", "bg", "border"]).map(([, hex]) => hex));
    const fever = hexes(["fever"]).map(([, hex]) => hex);
    expect(fever).toHaveLength(3);
    expect(fever.filter((hex) => brand.has(hex))).toEqual([]);
  });

  it("never lets lime be a CTA surface", () => {
    const rule = /\.btn-primary\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(rule).toContain("background: var(--brand-primary)");
    expect(rule.toUpperCase()).not.toContain("#D3F36B");
  });

  it("mirrors the CSS in lib/tokens for chart use", () => {
    for (const [token, group] of Object.entries(STATUS)) {
      expect(TOKENS.get(`status-${token}`)).toBe(group.mark.toUpperCase());
      expect(TOKENS.get(`status-${token}-ink`)).toBe(group.ink.toUpperCase());
      expect(TOKENS.get(`status-${token}-tint`)).toBe(group.tint.toUpperCase());
    }
    expect(TOKENS.get("fever-ok")).toBe(FEVER.ok.toUpperCase());
    expect(TOKENS.get("fever-watch")).toBe(FEVER.watch.toUpperCase());
    expect(TOKENS.get("fever-act")).toBe(FEVER.act.toUpperCase());
    expect(TOKENS.get("brand-primary")).toBe(BRAND.primary.toUpperCase());
    expect(TOKENS.get("brand-accent")).toBe(BRAND.accent.toUpperCase());
  });
});
