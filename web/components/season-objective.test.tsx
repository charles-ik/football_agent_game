import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeasonObjective } from "./season-objective";

describe("season ambition", () => {
  it("explains the configured reward, next action and completed state", () => {
    const objective = { id: "growth", season: 1, progress: 1, target: 3, reward: 7, completed: false };
    const { rerender } = render(<SeasonObjective objective={objective}/>);
    expect(screen.getByText("+7 reputation reward")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find your next client" })).toHaveAttribute("href", "/scouting");
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
    rerender(<SeasonObjective objective={{ ...objective, completed: true, progress: 0 }}/>);
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "3");
    expect(screen.getByText("+7 reputation earned")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/season-review");
  });
});
