import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RangeBar } from "@/components/range-bar";

describe("RangeBar", () => {
  it("renders the low-high label and confidence word", () => {
    render(<RangeBar low={61} high={74} confidence="confident" />);
    expect(screen.getByText("61–74")).toBeInTheDocument();
    expect(screen.getByText("confident")).toBeInTheDocument();
  });

  it("positions the bar as a fraction of the scale, not a fixed size", () => {
    const { container } = render(<RangeBar low={20} high={40} scaleMax={100} />);
    const fill = container.querySelector(".absolute.h-2.rounded") as HTMLElement;
    expect(fill.style.left).toBe("20%");
    expect(fill.style.width).toBe("20%");
  });

  it("keeps a narrow range visible with a minimum width", () => {
    const { container } = render(<RangeBar low={50} high={50.2} scaleMax={100} />);
    const fill = container.querySelector(".absolute.h-2.rounded") as HTMLElement;
    expect(Number.parseFloat(fill.style.width)).toBeGreaterThanOrEqual(1.5);
  });

  it("clamps a low/high pair that overruns the scale", () => {
    const { container } = render(<RangeBar low={90} high={130} scaleMax={100} />);
    const fill = container.querySelector(".absolute.h-2.rounded") as HTMLElement;
    const left = Number.parseFloat(fill.style.left);
    const width = Number.parseFloat(fill.style.width);
    expect(left + width).toBeLessThanOrEqual(100.001);
  });

  it("hides the label when showLabel is false", () => {
    render(<RangeBar low={10} high={20} showLabel={false} />);
    expect(screen.queryByText("10–20")).not.toBeInTheDocument();
  });

  it("falls back to the faint tone for an unknown confidence word", () => {
    const { container } = render(<RangeBar low={0} high={10} confidence="mysterious" />);
    const fill = container.querySelector(".absolute.h-2.rounded") as HTMLElement;
    expect(fill.className).toContain("bg-faint");
  });
});
