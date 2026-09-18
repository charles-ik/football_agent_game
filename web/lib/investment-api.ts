import "server-only";
import { z } from "zod";
import { api } from "@/lib/api";

const stockSchema = z.object({
  symbol: z.string(), name: z.string(), sector: z.string(), description: z.string(), risk: z.string(),
  price: z.number(), change_pct: z.number(), shares: z.number(), cost_basis: z.number(), value: z.number(), unrealized_gain: z.number(),
  history: z.array(z.object({ week: z.number(), price: z.number() })),
});
const investmentSchema = z.object({
  week: z.number(), cash: z.number(), weekly_net: z.number(), fee_pct: z.number(), minimum_fee: z.number(), max_trade_shares: z.number(),
  portfolio_value: z.number(), net_worth: z.number(), realized_gain: z.number(), unrealized_gain: z.number(), stocks: z.array(stockSchema),
  trades: z.array(z.object({ week: z.number(), symbol: z.string(), side: z.enum(["buy", "sell"]), shares: z.number(), price: z.number(), fee: z.number(), total: z.number() })),
});
export type InvestmentDTO = z.infer<typeof investmentSchema>;
export type StockDTO = z.infer<typeof stockSchema>;
export const getInvestments = async () => investmentSchema.parse(await api<unknown>("/api/investments"));
