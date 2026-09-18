import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InvestmentDesk, investmentQuote } from "./investment-desk";
import { tradeShares } from "@/lib/actions";
import type { InvestmentDTO } from "@/lib/investment-api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions", () => ({ tradeShares: vi.fn(async () => ({ ok: true, message: "Bought 10 FLD shares.", events: [] })) }));

const market: InvestmentDTO = {
  week: 1, cash: 2000, weekly_net: -100, fee_pct: .005, minimum_fee: 1, max_trade_shares: 1000000,
  portfolio_value: 0, net_worth: 2000, realized_gain: 0, unrealized_gain: 0, trades: [],
  stocks: [{ symbol: "FLD", name: "Fieldstone Index", sector: "Diversified fund", description: "A fictional fund.", risk: "Lower", price: 100, change_pct: 0, shares: 0, cost_basis: 0, value: 0, unrealized_gain: 0, history: [{ week: 1, price: 100 }] }],
};

describe("investment trading", () => {
  it("quotes minimum and percentage fees in pennies", () => {
    expect(investmentQuote(24, 1, "buy", .005, 1)).toEqual({ fee: 1, total: 25 });
    expect(investmentQuote(100, 10, "buy", .005, 1)).toEqual({ fee: 5, total: 1005 });
    expect(investmentQuote(100, 10, "sell", .005, 1)).toEqual({ fee: 5, total: 995 });
    expect(investmentQuote(100.01, 3, "buy", .005, 1)).toEqual({ fee: 1.5, total: 301.53 });
  });
  it("requires a cash-backed review before executing and blocks overselling", async () => {
    render(<InvestmentDesk market={market} revision={7}/>);
    fireEvent.change(screen.getByLabelText(/Number of shares/), { target: { value: "100" } });
    expect(screen.getByRole("button", { name: "Review purchase" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Number of shares/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Review purchase" }));
    expect(tradeShares).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("£995.00");
    fireEvent.click(screen.getByRole("button", { name: "Confirm purchase" }));
    await waitFor(() => expect(tradeShares).toHaveBeenCalledWith("FLD", "buy", 10, 7));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Sell shares" }));
    expect(screen.getByRole("button", { name: "Review sale" })).toBeDisabled();
  });
});
