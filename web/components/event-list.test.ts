import { describe, expect, it } from "vitest";

import { eventHref, navRouteForEvent } from "@/components/event-list";
import type { EventDTO } from "@/lib/types";

function makeEvent(data: Record<string, unknown>): EventDTO {
  return { kind: "test", message: "test", week: 1, severity: "info", data };
}

describe("eventHref", () => {
  it("deep-links a player id straight to the client", () => {
    expect(eventHref(makeEvent({ player_id: 12 }))).toBe("/clients/12");
  });

  it("deep-links player + interest ids into the deal flow", () => {
    expect(eventHref(makeEvent({ player_id: 12, interest_id: 7 }))).toBe(
      "/clients/12?negotiate=7",
    );
  });

  it("sends a scout id to the scouting screen", () => {
    expect(eventHref(makeEvent({ scout_id: 3 }))).toBe("/scouting");
  });

  it("has no link for an event carrying no routable id", () => {
    expect(eventHref(makeEvent({}))).toBeNull();
  });

  it("ignores non-numeric ids (defensive against malformed data)", () => {
    expect(eventHref(makeEvent({ player_id: "12" }))).toBeNull();
  });
});

describe("navRouteForEvent", () => {
  it("collapses a client deep-link to the Clients nav section", () => {
    expect(navRouteForEvent(makeEvent({ player_id: 12, interest_id: 7 }))).toBe("/clients");
  });

  it("collapses a scouting deep-link to the Scouting nav section", () => {
    expect(navRouteForEvent(makeEvent({ scout_id: 3 }))).toBe("/scouting");
  });

  it("has no section for a non-routable event", () => {
    expect(navRouteForEvent(makeEvent({}))).toBeNull();
  });
});
