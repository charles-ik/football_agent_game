// Zod schemas — the API contract validated at the boundary. If the API ever
// drifts from docs/ui_build_plan/02-api-contract.md, the page fails loudly
// here rather than rendering nonsense.
import { z } from "zod";

export const moneySchema = z.object({ amount: z.number(), text: z.string() });

export const eventSchema = z.object({
  kind: z.string(),
  message: z.string(),
  week: z.number(),
  severity: z.enum(["info", "good", "warning", "critical", "action"]),
  data: z.record(z.string(), z.unknown()),
});

export const actionResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  events: z.array(eventSchema),
});

export const playerSchema = z.object({
  id: z.number(),
  name: z.string(),
  age: z.number(),
  position: z.enum(["GK", "DF", "MF", "FW"]),
  trait: z.enum(["ambitious", "mercenary", "loyal", "professional"]),
  region_id: z.string(),
  club_id: z.number().nullable(),
  club_name: z.string(),
  injury_weeks: z.number(),
  transfer_listed: z.boolean(),
  seeking_move: z.boolean(),
  retired: z.boolean(),
  contract: z
    .object({ wage: moneySchema, expires_week: z.number(), years_signed: z.number() })
    .nullable(),
  represented_by: z.string().nullable(),
});

export const reportSchema = z.object({
  ability_low: z.number(),
  ability_high: z.number(),
  potential_low: z.number(),
  potential_high: z.number(),
  confidence: z.string(),
  weeks_watched: z.number(),
  first_seen_week: z.number(),
  region_id: z.string(),
  scout_id: z.number().nullable(),
});

export const gameStateSchema = z.object({
  agency: z.object({
    name: z.string(),
    cash: moneySchema,
    reputation: z.number(),
    reputation_label: z.string(),
    hq_level: z.number(),
    hq_name: z.string(),
    total_commission: moneySchema,
    total_costs: moneySchema,
  }),
  calendar: z.object({
    week: z.number(),
    season: z.number(),
    season_week: z.number(),
    description: z.string(),
    window_open: z.boolean(),
    window_name: z.string().nullable(),
    weeks_until_window_closes: z.number().nullable(),
    weeks_until_next_window: z.number(),
    is_match_week: z.boolean(),
  }),
  counts: z.object({
    clients: z.number(),
    client_cap: z.number(),
    scouts: z.number(),
    scout_cap: z.number(),
  }),
  weekly_net: moneySchema,
  pending_actions: z.number(),
  game_over: z.boolean(),
  game_over_reason: z.string(),
});

export const continueSchema = z.object({
  state: gameStateSchema,
  events: z.array(eventSchema),
  notable: z.array(eventSchema),
});

export const inboxSchema = z.object({
  needs_decision: z.array(eventSchema),
  recent: z.array(eventSchema),
});

const clientFlagsSchema = z.object({
  injured_weeks: z.number(),
  transfer_listed: z.boolean(),
  seeking_move: z.boolean(),
  interest_count: z.number(),
  agent_contract_expiring: z.boolean(),
});

export const clientRowSchema = z.object({
  player: playerSchema,
  report: reportSchema.nullable(),
  club_name: z.string(),
  playing_time: z.string(),
  wage: moneySchema.nullable(),
  club_contract_weeks_left: z.number().nullable(),
  commission_pct: z.number(),
  agent_contract_weeks_left: z.number(),
  trust: z.number(),
  trust_label: z.string(),
  flags: clientFlagsSchema,
});

export const interestSchema = z.object({
  id: z.number(),
  club_id: z.number(),
  club_name: z.string(),
  club_strength: z.number(),
  is_renewal: z.boolean(),
  urgency: z.number(),
  max_wage: moneySchema,
  max_fee: moneySchema,
  expires_in_weeks: z.number(),
  can_negotiate: z.object({ ok: z.boolean(), reason: z.string() }),
});

export const clientDetailSchema = clientRowSchema.extend({
  club: z
    .object({
      id: z.number(),
      name: z.string(),
      strength: z.number(),
      prestige: z.number(),
      league_position: z.number(),
    })
    .nullable(),
  market_value: moneySchema,
  asking_price: moneySchema,
  interests: z.array(interestSchema),
  can_renew: z.object({ ok: z.boolean(), reason: z.string() }),
});

export const scoutingStateSchema = z.object({
  regions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      country: z.string(),
      star_rating: z.number(),
      scouting_cost: moneySchema,
      expected_ability: z.number(),
      scouts_assigned: z.number(),
      report_count: z.number(),
    }),
  ),
  scouts: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      quality: z.number(),
      wage: moneySchema,
      region_id: z.string().nullable(),
      region_name: z.string().nullable(),
      brief_position: z.string().nullable(),
      brief_max_age: z.number().nullable(),
      focus_player_id: z.number().nullable(),
      focus_player_name: z.string().nullable(),
      precision: z.number(),
    }),
  ),
  reports: z.array(
    z.object({
      player: playerSchema,
      report: reportSchema,
      can_approach: z.boolean(),
      approach_blocked_reason: z.string(),
    }),
  ),
});

export const candidatesSchema = z.array(
  z.object({
    index: z.number(),
    name: z.string(),
    quality: z.number(),
    wage: moneySchema,
    signing_fee: moneySchema,
  }),
);

const hqLevelSchema = z.object({
  level: z.number(),
  name: z.string(),
  scout_cap: z.number(),
  client_cap: z.number(),
  precision_bonus: z.number(),
  weekly_cost: moneySchema,
  upgrade_cost: moneySchema,
});

export const hqSchema = z.object({
  current: hqLevelSchema,
  next: hqLevelSchema.nullable(),
  can_upgrade: z.object({ ok: z.boolean(), reason: z.string() }),
  weekly_net_now: moneySchema,
  weekly_net_after: moneySchema.nullable(),
});

export const financesSchema = z.object({
  cash: moneySchema,
  weekly_net: moneySchema,
  total_commission: moneySchema,
  total_costs: moneySchema,
  weeks_until_broke: z.number().nullable(),
  weeks_until_next_window: z.number(),
  history: z.array(
    z.object({
      week: z.number(),
      retainers: moneySchema,
      commission: moneySchema,
      scout_wages: moneySchema,
      hq_cost: moneySchema,
      region_costs: moneySchema,
      income: moneySchema,
      expenditure: moneySchema,
      net: moneySchema,
    }),
  ),
});

export const leaguesSchema = z.array(
  z.object({
    id: z.number(),
    name: z.string(),
    tier: z.number(),
    round_index: z.number(),
    table: z.array(
      z.object({
        position: z.number(),
        club_id: z.number(),
        club_name: z.string(),
        played: z.number(),
        won: z.number(),
        drawn: z.number(),
        lost: z.number(),
        goals_for: z.number(),
        goals_against: z.number(),
        goal_difference: z.number(),
        points: z.number(),
        has_client: z.boolean(),
      }),
    ),
  }),
);

export const metaSchema = z.object({
  commission: z.object({ min_pct: z.number(), max_pct: z.number() }),
  calendar: z.object({
    weeks_per_season: z.number(),
    windows: z.array(z.tuple([z.number(), z.number()])),
    window_names: z.record(z.string(), z.string()),
  }),
  hq_levels: z.array(hqLevelSchema),
  positions: z.array(z.string()),
  traits: z.array(z.string()),
  trait_blurbs: z.record(z.string(), z.string()),
});

export const saveSlotSchema = z.object({
  slot: z.string(),
  modified_at: z.number(),
  compatible: z.boolean(),
  agency_name: z.string().nullable(),
  week: z.number().nullable(),
});

export const savesSchema = z.object({ slots: z.array(saveSlotSchema) });

export const negotiationSchema = z.object({
  id: z.string(),
  kind: z.enum(["signing", "renewal", "deal"]),
  subject: z.string(),
  status: z.enum(["open", "accepted", "walked", "exhausted", "abandoned"]),
  round: z.number(),
  max_rounds: z.number(),
  rounds_left: z.number(),
  axis: z.enum(["commission_pct", "package"]),
  guide: z.union([
    z.object({ low_pct: z.number(), high_pct: z.number() }),
    z.object({
      low_wage: moneySchema,
      high_wage: moneySchema,
      low_fee: moneySchema,
      high_fee: moneySchema,
    }),
  ]),
  bounds: z.union([
    z.object({ min_pct: z.number(), max_pct: z.number() }),
    z.object({ max_wage: moneySchema, max_fee: moneySchema, asking_price: moneySchema }),
  ]),
  context: z.record(z.string(), z.unknown()),
  history: z.array(
    z.object({
      round: z.number(),
      hint: z.string(),
      status: z.string(),
      offer: z
        .union([z.object({ pct: z.number() }), z.object({ wage: moneySchema, fee: moneySchema })])
        .nullable(),
    }),
  ),
  last_response: z.object({ hint: z.string(), round: z.number() }).nullable(),
  counter: z
    .union([z.object({ pct: z.number() }), z.object({ wage: moneySchema, fee: moneySchema })])
    .nullable(),
  result: actionResultSchema.optional(),
});

export const openNegotiationSchema = z.union([negotiationSchema, actionResultSchema]);

export const assessSchema = z.object({ trust_delta: z.number(), verdict: z.string() });

export const newGameSchema = z.object({ state: gameStateSchema, seed: z.number() });
