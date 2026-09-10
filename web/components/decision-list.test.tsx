import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MouseEventHandler, ReactNode } from "react";

import { DecisionList } from "@/components/decision-list";
import type { Decision } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...props }: { href: string; children: ReactNode; onClick?: MouseEventHandler<HTMLAnchorElement> }) => (
    <a href={href} {...props} onClick={(event) => { event.preventDefault(); onClick?.(event); }}>
      {children}
    </a>
  ),
}));

const conversation: Decision = {
  id: "12:playing_time:4",
  kind: "career.story",
  severity: "action",
  headline: "He wants a clearer plan",
  detail: "A conversation is waiting.",
  player_id: 12,
  interest_id: null,
  weeks_left: null,
  actionable: true,
  blocked_reason: "",
  href: "/careers",
  extra: {},
};

describe("DecisionList", () => {
  it("closes its owner before following a selected event link", () => {
    const onSelect = vi.fn();
    render(<DecisionList decisions={[conversation]} onSelect={onSelect} />);

    const link = screen.getByRole("link", { name: /he wants a clearer plan/i });
    expect(link).toHaveAttribute("href", "/careers");

    fireEvent.click(link);

    expect(onSelect).toHaveBeenCalledWith(conversation);
  });
});
