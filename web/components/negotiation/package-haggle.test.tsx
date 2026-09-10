import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NegotiationDTO } from "@/lib/types";

import { PackageHaggle } from "./package-haggle";

const mocks = vi.hoisted(() => ({
  assess: vi.fn(),
  abandon: vi.fn(),
  acceptCounter: vi.fn(),
  propose: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/actions", () => ({
  assessDeal: mocks.assess,
  abandonNegotiation: mocks.abandon,
  acceptCounter: mocks.acceptCounter,
  proposePackage: mocks.propose,
}));
vi.mock("@/components/toaster", () => ({ useToast: () => ({ toast: mocks.toast }) }));

const value = (amount: number, text: string) => ({ amount, text });

const negotiation = (contract: { wage: ReturnType<typeof value> } | null): NegotiationDTO => ({
  revision: 4,
  id: "neg-1",
  kind: "deal",
  subject: "Northbank FC",
  status: "open",
  round: 0,
  max_rounds: 3,
  rounds_left: 3,
  axis: "package",
  guide: {
    low_wage: value(2_000, "£2.0k"),
    high_wage: value(3_000, "£3.0k"),
    low_fee: value(40_000, "£40.0k"),
    high_fee: value(60_000, "£60.0k"),
  },
  bounds: {
    max_wage: value(4_000, "£4.0k"),
    max_fee: value(80_000, "£80.0k"),
    asking_price: value(50_000, "£50.0k"),
  },
  context: {
    player: { club_id: contract ? 1 : null, name: "A. Player", contract },
    club: { name: "Northbank FC", strength: 50, prestige: 50 },
    is_renewal: false,
    years: 3,
  },
  history: [],
  last_response: null,
  counter: null,
});

beforeEach(() => {
  mocks.assess.mockReset();
  mocks.abandon.mockReset();
  mocks.acceptCounter.mockReset();
  mocks.propose.mockReset();
  mocks.toast.mockReset();
  mocks.assess.mockResolvedValue({
    trust_delta: 2,
    verdict: "He can live with it.",
    current_wage: value(2_000, "£2.0k"),
    wage_delta: value(1_000, "+£1.0k"),
  });
});

describe("PackageHaggle wage context", () => {
  it("renders the current wage and the signed assessment delta", async () => {
    render(
      <PackageHaggle
        neg={negotiation({ wage: value(2_000, "£2.0k") })}
        onUpdate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Current wage")).toBeInTheDocument();
    expect(screen.getAllByText("£2.0k").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText("+£1.0k")).toBeInTheDocument());
    expect(mocks.assess).toHaveBeenCalledWith("neg-1", 2_000);
  });

  it("does not invent a current wage for a free agent", () => {
    render(<PackageHaggle neg={negotiation(null)} onUpdate={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getAllByText("No current wage").length).toBeGreaterThan(0);
  });
});
