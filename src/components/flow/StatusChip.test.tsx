import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { FLOW_STATE_LABEL, type FlowState } from "@/lib/flow";
import { STATUS, type StatusToken } from "@/lib/tokens";
import { StatusChip } from "./StatusChip";

/**
 * StatusChip — 07_DESIGN_SYSTEM §7.3 and §7.11.
 *
 * Two things are checked, and they are the two that decay quietly:
 *  - the triad (colour + icon + label) is emitted for every state, so a status is
 *    never carried by colour alone;
 *  - ink-on-tint clears WCAG AA, which is arithmetic and so can be asserted here
 *    rather than left to a palette review.
 *
 * axe runs as a smoke test on the rendered markup. jsdom does not load the
 * stylesheet, so axe's colour rules cannot fire — that is what the contrast
 * arithmetic below is for.
 */

const STATES: FlowState[] = [
  "proposed",
  "ready",
  "active",
  "waiting_internal",
  "waiting_external",
  "waiting_decision",
  "waiting_dependency",
  "review",
  "done",
  "cancelled",
];

/** WCAG 2.2 relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

afterEach(cleanup);

describe("StatusChip", () => {
  it.each(STATES)("emits colour, icon and label for %s", (state) => {
    const { container } = render(<StatusChip state={state} />);
    const chip = container.firstElementChild!;

    expect(chip.textContent).toBe(FLOW_STATE_LABEL[state]);
    expect(chip.querySelector("svg")).not.toBeNull();
    expect(chip.className).toMatch(/bg-status-\w+-tint/);
    expect(chip.className).toMatch(/text-status-\w+-ink/);
  });

  it("renders the attention tier with its own icon and label", () => {
    const { container } = render(<StatusChip state="waiting_internal" attention />);
    const chip = container.firstElementChild!;
    expect(chip.textContent).toBe("Needs attention");
    expect(chip.className).toContain("bg-status-attention-tint");
  });

  it("never reaches for a brand colour", () => {
    for (const state of STATES) {
      const { container } = render(<StatusChip state={state} />);
      const className = container.firstElementChild!.className;
      expect(className).not.toMatch(/lime|forest|brand-accent|gold/);
      cleanup();
    }
  });

  it("passes axe on the rendered chip", async () => {
    const { container } = render(
      <div>
        {STATES.map((state) => (
          <StatusChip key={state} state={state} />
        ))}
      </div>,
    );
    const results = await axe.run(container, {
      // jsdom has no stylesheet, so colour rules cannot be evaluated here.
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it("clears WCAG AA for ink on tint, and 3:1 for marks on the app background", () => {
    for (const [token, group] of Object.entries(STATUS) as Array<
      [StatusToken, (typeof STATUS)[StatusToken]]
    >) {
      expect(contrast(group.ink, group.tint), `${token} ink on tint`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(group.mark, "#FFFFFF"), `${token} mark on white`).toBeGreaterThanOrEqual(3);
    }
  });
});
