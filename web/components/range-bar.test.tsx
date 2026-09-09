import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RangeBar } from "@/components/range-bar";

// These assert geometry and semantics, not styling. The bar is redrawn
// whenever the visual language changes; what must not change is that the band
// is positioned as a fraction of the scale, stays inside it, and is announced
// to assistive technology.
function fill(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-range-fill]");
  if (!el) throw new Error("range bar fill not found");
  return el;
}

describe("RangeBar", () => {
  it("renders the low-high label and confidence word", () => {
    render(<RangeBar low={61} high={74} confidence="confident" />);
    expect(screen.getByText("61–74")).toBeInTheDocument();
    expect(screen.getByText(/confident/)).toBeInTheDocument();
  });

  it("positions the bar as a fraction of the scale, not a fixed size", () => {
    const { container } = render(<RangeBar low={20} high={40} scaleMax={100} />);
    expect(fill(container).style.left).toBe("20%");
    expect(fill(container).style.width).toBe("20%");
  });

  it("keeps a narrow range visible with a minimum width", () => {
    const { container } = render(<RangeBar low={50} high={50.2} scaleMax={100} />);
    expect(Number.parseFloat(fill(container).style.width)).toBeGreaterThanOrEqual(1.5);
  });

  it("clamps a low/high pair that overruns the scale", () => {
    const { container } = render(<RangeBar low={90} high={130} scaleMax={100} />);
    const el = fill(container);
    const left = Number.parseFloat(el.style.left);
    const width = Number.parseFloat(el.style.width);
    expect(left + width).toBeLessThanOrEqual(100.001);
  });

  it("hides the label when showLabel is false", () => {
    render(<RangeBar low={10} high={20} showLabel={false} />);
    expect(screen.queryByText("10–20")).not.toBeInTheDocument();
  });

  it("announces the range to assistive technology even without a label", () => {
    render(<RangeBar low={10} high={20} confidence="guesswork" showLabel={false} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Range 10 to 20, guesswork");
  });

  it("survives an unknown confidence word rather than throwing", () => {
    render(<RangeBar low={0} high={10} confidence="mysterious" />);
    expect(screen.getByText(/mysterious/)).toBeInTheDocument();
  });
});
