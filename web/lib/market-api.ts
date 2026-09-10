import "server-only";
import { z } from "zod";
import { api } from "@/lib/api";
const clubSchema = z.object({ id: z.number(), name: z.string(), tier: z.number(), strength: z.number(), prestige: z.number(), needs: z.record(z.number()), wage_headroom: z.number(), transfer_budget: z.number(), relationship: z.number(), history: z.array(z.object({ week: z.number(), change: z.number(), reason: z.string(), value: z.number() })) });
const talkSchema = z.object({ id: z.number(), player_id: z.number(), parent_club_id: z.number(), host_club_id: z.number(), ends_week: z.number(), expires_week: z.number(), rounds: z.number(), contribution_pct: z.number(), fee: z.number(), status: z.string() });
const marketSchema = z.object({
    window_open: z.boolean(), clubs: z.array(clubSchema),
    comparisons: z.array(z.object({ player_id: z.number(), club_id: z.number(), predicted_playing_time: z.object({ low: z.string(), high: z.string() }).nullable(), uncertainty: z.string(), estimated_commission: z.number().nullable(), commission_note: z.string(), wage_ceiling: z.number().nullable(), goal_fit: z.string(), pitch_used: z.boolean() })),
    interests: z.array(z.object({ id: z.number(), player_id: z.number(), club_id: z.number(), max_wage: z.number(), max_fee: z.number(), is_renewal: z.boolean(), expires_week: z.number() })),
    rivals: z.array(z.object({ id: z.number(), name: z.string(), reputation: z.number(), players: z.array(z.object({ id: z.number(), name: z.string(), position: z.string(), club_name: z.string() })) })),
    loans: z.array(z.object({ id: z.number(), player_id: z.number(), parent_club_id: z.number(), host_club_id: z.number(), starts_week: z.number(), ends_week: z.number(), wage: z.number(), contribution_pct: z.number(), fee: z.number(), commission: z.number(), active: z.boolean() })),
    talks: z.array(talkSchema), rival_warnings: z.array(z.object({ player_id: z.number(), since_week: z.number() })),
    loan_terms: z.object({ min_contribution_pct: z.number(), max_contribution_pct: z.number(), max_rounds: z.number() }),
});
export type MarketDTO = z.infer<typeof marketSchema>;
export async function getMarket(): Promise<MarketDTO> { return marketSchema.parse(await api<unknown>("/api/market")); }
