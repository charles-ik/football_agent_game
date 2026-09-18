import "server-only";
import { z } from "zod";
import { api } from "@/lib/api";

const quoteSchema = z.object({cash_after: z.number(), weekly_net_after: z.number(), runway_weeks: z.number().nullable()});
const staffSchema = z.object({id:z.number(), name:z.string(), role:z.enum(["client_manager", "club_liaison"]), quality:z.number(), wage:z.number(), hire_cost:z.number(), capacity:z.number(), player_ids:z.array(z.number()), club_ids:z.array(z.number())});
export const managementSchema = z.object({
  shortlisted_players: z.array(z.number()),
  identity:z.object({emblem:z.string(), accent:z.string(), emblems:z.array(z.string()), accents:z.array(z.string())}),
  staff:z.array(staffSchema), candidates:z.array(staffSchema.extend({quote:quoteSchema})), support_slots:z.number(), support_weekly_cost:z.number(),
  finance:z.object({weekly_net:z.number(), runway_weeks:z.number().nullable()}),
  departments:z.array(z.object({id:z.string(), level:z.number(), upgrade_cost:z.number(), weekly_cost:z.number(), next_weekly_cost:z.number(), can_upgrade:z.boolean(), quote:quoteSchema})),
  specialization:z.string(), specialization_options:z.array(z.string()), can_specialize:z.boolean(),
  objective:z.object({id:z.string(), season:z.number(), progress:z.number(), target:z.number(), reward:z.number(), completed:z.boolean()}),
  objective_options:z.array(z.object({id:z.string(), target:z.number(), reward:z.number()})),
  reviews:z.array(z.object({season:z.number(), objective:z.string(), completed:z.boolean(), progress:z.number(), target:z.number()})),
  milestones:z.record(z.string(), z.number()),
});
export type ManagementDTO = z.infer<typeof managementSchema>;
export type SupportStaffDTO = z.infer<typeof staffSchema>;
export const getManagement = async () => managementSchema.parse(await api<unknown>("/api/management"));
const clubSchema = z.object({id:z.number(),name:z.string(),tier:z.number()});
export type PortfolioClub = z.infer<typeof clubSchema>;
export const getPortfolioClubs = async () => z.object({clubs:z.array(clubSchema)}).parse(await api<unknown>("/api/market")).clubs;
