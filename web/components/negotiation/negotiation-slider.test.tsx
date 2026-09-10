import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  NegotiationSlider,
  roundSliderValue,
  sliderPosition,
  sliderValueAtPosition,
  tightenedSliderScale,
} from "@/components/negotiation/negotiation-slider";

describe("NegotiationSlider mapping", () => {
  it("tightens the visual lens around the guide band without changing semantic bounds", () => {
    const scale = tightenedSliderScale(0, 10_000, 4_000, 6_000, 1_000);
    const guideWidth =
      sliderPosition(6_000, scale.min, scale.max) - sliderPosition(4_000, scale.min, scale.max);

    expect(scale.min).toBeGreaterThan(0);
    expect(scale.max).toBeLessThan(10_000);
    expect(guideWidth).toBeGreaterThan(60);
  });

  it("maps the visible track edges to stepped legal values", () => {
    const scale = tightenedSliderScale(0, 10_000, 4_000, 6_000, 1_000);

    expect(sliderValueAtPosition(0, scale.min, scale.max, 0, 10_000, 1_000)).toBe(4_000);
    expect(sliderValueAtPosition(0.5, scale.min, scale.max, 0, 10_000, 1_000)).toBe(5_000);
    expect(sliderValueAtPosition(1, scale.min, scale.max, 0, 10_000, 1_000)).toBe(7_000);
  });

  it("clamps pointer values and rounds them to the existing step", () => {
    expect(sliderValueAtPosition(-1, 0, 100, 0, 100, 10)).toBe(0);
    expect(sliderValueAtPosition(2, 0, 100, 0, 100, 10)).toBe(100);
    expect(sliderValueAtPosition(0.236, 0, 100, 0, 100, 10)).toBe(20);
    expect(roundSliderValue(0.1349, 0.03, 0.2, 0.001)).toBe(0.135);
  });

  it("maps left, middle, and right track clicks to the tightened scale", () => {
    const onChange = vi.fn();
    render(
      <NegotiationSlider
        ariaLabel="Wage / week"
        value={5_000}
        min={0}
        max={10_000}
        step={1_000}
        guideLow={4_000}
        guideHigh={6_000}
        onChange={onChange}
      />,
    );
    const slider = screen.getByRole("slider");
    Object.defineProperty(slider, "getBoundingClientRect", {
      value: () => ({ left: 100, width: 200, top: 0, right: 300, bottom: 12, height: 12 }),
    });

    slider.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }));
    slider.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 200 }));
    slider.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 300 }));

    expect(onChange.mock.calls.map(([value]) => value)).toEqual([4_000, 5_000, 7_000]);
  });
});
