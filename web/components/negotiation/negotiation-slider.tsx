"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@/components/ui";

export type SliderMarker = {
  value: number;
  label: string;
  tone?: "warn" | "accent" | "neutral";
};

export type SliderScale = {
  min: number;
  max: number;
};

type NegotiationSliderProps = {
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  guideLow: number;
  guideHigh: number;
  onChange: (value: number) => void;
  markers?: SliderMarker[];
  ariaValueText?: string;
  className?: string;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function decimalPlaces(value: number): number {
  const text = String(value);
  const decimal = text.indexOf(".");
  return decimal === -1 ? 0 : text.length - decimal - 1;
}

/** Keep a value on the same stepped grid as the native inputs used elsewhere. */
export function roundSliderValue(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) return min;
  const safeStep = Math.max(Math.abs(step), Number.EPSILON);
  const rounded = min + Math.round((value - min) / safeStep) * safeStep;
  const precision = Math.max(decimalPlaces(safeStep), decimalPlaces(min));
  return clamp(Number(rounded.toFixed(precision)), min, max);
}

/** Convert a value into a percentage of the visual (not semantic) scale. */
export function sliderPosition(value: number, scaleMin: number, scaleMax: number): number {
  if (scaleMax <= scaleMin) return 0;
  return clamp((value - scaleMin) / (scaleMax - scaleMin), 0, 1) * 100;
}

/** Map a click in the visual scale back to a legal, stepped value. */
export function sliderValueAtPosition(
  position: number,
  scaleMin: number,
  scaleMax: number,
  min: number,
  max: number,
  step: number,
): number {
  const ratio = clamp(position, 0, 1);
  const raw = scaleMin + ratio * Math.max(0, scaleMax - scaleMin);
  return roundSliderValue(clamp(raw, min, max), min, max, step);
}

/**
 * Make the guide band readable without changing the legal input range.
 * Values outside this visual lens are still reachable with Home/End or the
 * number field; their marker simply rests at the nearest visible edge.
 */
export function tightenedSliderScale(
  min: number,
  max: number,
  guideLow: number,
  guideHigh: number,
  step: number,
  anchors: number[] = [],
): SliderScale {
  const semanticMin = Math.min(min, max);
  const semanticMax = Math.max(min, max);
  if (semanticMin === semanticMax) return { min: semanticMin, max: semanticMax };

  const bandLow = clamp(Math.min(guideLow, guideHigh), semanticMin, semanticMax);
  const bandHigh = clamp(Math.max(guideLow, guideHigh), semanticMin, semanticMax);
  const anchorValues = anchors.filter(Number.isFinite).map((value) =>
    clamp(value, semanticMin, semanticMax),
  );
  const meaningfulLow = Math.min(bandLow, ...anchorValues);
  const meaningfulHigh = Math.max(bandHigh, ...anchorValues);
  const domainSpan = semanticMax - semanticMin;
  const bandSpan = Math.max(bandHigh - bandLow, Math.abs(step), Number.EPSILON);
  const padding = Math.max(bandSpan * 0.25, domainSpan * 0.03);

  let scaleMin = clamp(meaningfulLow - padding, semanticMin, semanticMax);
  let scaleMax = clamp(meaningfulHigh + padding, semanticMin, semanticMax);
  if (scaleMax <= scaleMin) {
    scaleMin = semanticMin;
    scaleMax = semanticMax;
  }
  return { min: scaleMin, max: scaleMax };
}

export function NegotiationSlider({
  ariaLabel,
  value,
  min,
  max,
  step,
  guideLow,
  guideHigh,
  onChange,
  markers = [],
  ariaValueText,
  className,
}: NegotiationSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const scale = tightenedSliderScale(min, max, guideLow, guideHigh, step, markers.map((marker) => marker.value));
  const guideLeft = sliderPosition(guideLow, scale.min, scale.max);
  const guideRight = sliderPosition(guideHigh, scale.min, scale.max);
  const markerPosition = sliderPosition(value, scale.min, scale.max);
  const accessibleValue = clamp(value, Math.min(min, max), Math.max(min, max));

  function setFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const position = (event.clientX - rect.left) / rect.width;
    onChange(sliderValueAtPosition(position, scale.min, scale.max, min, max, step));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setFromPointer(event);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragging.current) setFromPointer(event);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    dragging.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: number | null = null;
    const pageStep = step * 10;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = value - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = value + step;
        break;
      case "PageDown":
        next = value - pageStep;
        break;
      case "PageUp":
        next = value + pageStep;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(roundSliderValue(next, min, max, step));
  }

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-3 w-full cursor-pointer touch-none select-none rounded-full border border-line/70 bg-panel-2 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent/70",
        className,
      )}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={accessibleValue}
      aria-valuetext={ariaValueText}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 rounded-full bg-accent/25"
        style={{ left: `${guideLeft}%`, width: `${Math.max(0, guideRight - guideLeft)}%` }}
      />
      {markers.map((marker) => (
        <div
          key={`${marker.label}:${marker.value}`}
          aria-hidden
          className={cn(
            "absolute -top-0.5 h-4 w-0.5 rounded-full",
            marker.tone === "accent"
              ? "bg-accent"
              : marker.tone === "neutral"
                ? "bg-dim"
                : "bg-warn",
          )}
          style={{ left: `${sliderPosition(marker.value, scale.min, scale.max)}%` }}
          title={marker.label}
        />
      ))}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1 h-5 w-1 rounded-full bg-fg shadow-sm transition-[left] duration-150"
        style={{ left: `${markerPosition}%` }}
      />
    </div>
  );
}
