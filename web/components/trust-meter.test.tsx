import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrustMeter } from "@/components/trust-meter";

function fill(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-trust-fill]");
  if (!el) throw new Error("trust meter fill not found");
  return el;
}

describe("TrustMeter", () => {
  it("leads with the label, the number secondary", () => {
    render(<TrustMeter trust={72} label="Warm" />);
    expect(screen.getByText("Warm")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
  });

  it("goes red under 40 — the band where he starts refusing you", () => {
    render(<TrustMeter trust={39} label="Cold" />);
    expect(screen.getByText("Cold")).toHaveClass("text-bad");
  });

  it("stays neutral at or above 40", () => {
    render(<TrustMeter trust={40} label="Steady" />);
    expect(screen.getByText("Steady")).toHaveClass("text-dim");
    expect(screen.getByText("Steady")).not.toHaveClass("text-bad");
  });

  it("clamps the fill width to the 0-100 range", () => {
    const { container } = render(<TrustMeter trust={150} label="Overflowing" />);
    expect(fill(container).style.width).toBe("100%");
  });

  it("clamps a negative trust value to zero", () => {
    const { container } = render(<TrustMeter trust={-20} label="Hostile" />);
    expect(fill(container).style.width).toBe("0%");
  });

  it("rounds a fractional trust value for display", () => {
    render(<TrustMeter trust={55.6} label="Fine" />);
    expect(screen.getByText("56")).toBeInTheDocument();
  });

  it("announces trust to assistive technology", () => {
    render(<TrustMeter trust={63} label="Content" />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Trust 63 out of 100, Content");
  });
});
