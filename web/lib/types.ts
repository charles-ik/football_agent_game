// DTO types, mirroring docs/ui_build_plan/02-api-contract.md.
// Every number the UI displays comes from the API in one of these shapes;
// the browser holds no game rules and computes no game values.

export type PlayingTime = "key" | "starter" | "rotation" | "fringe" | "reserve";

export type Money = { amount: number; text: string };

export type Severity = "info" | "good" | "warning" | "critical" | "action";

export type EventDTO = {
  kind: string;
  message: string;
  week: number;
  severity: Severity;
  data: Record<string, unknown>;
};

export type ActionResultDTO = {
  ok: boolean;
  message: string;
  events: EventDTO[];
};

export type PlayerDTO = {
  id: number;
  name: string;
  age: number;
  position: "GK" | "DF" | "MF" | "FW";
  trait: "ambitious" | "mercenary" | "loyal" | "professional";
  region_id: string;
  club_id: number | null;
  club_name: string;
  injury_weeks: number;
  transfer_listed: boolean;
  seeking_move: boolean;
  retired: boolean;
  contract: { wage: Money; expires_week: number; years_signed: number } | null;
  represented_by: string | null;
  // NO ability. NO potential. Ever.
};

export type ScoutingReportDTO = {
  ability_low: number;
  ability_high: number;
  potential_low: number;
  potential_high: number;
  confidence: string;
  weeks_watched: number;
  first_seen_week: number;
  region_id: string;
  scout_id: number | null;
};

export type GameState = {
  revision: number;
  agency: {
    name: string;
    cash: Money;
    reputation: number;
    reputation_label: string;
    hq_level: number;
    hq_name: string;
    total_commission: Money;
    total_costs: Money;
  };
  calendar: {
    week: number;
    season: number;
    season_week: number;
    description: string;
    window_open: boolean;
    window_name: string | null;
    weeks_until_window_closes: number | null;
    weeks_until_next_window: number;
    is_match_week: boolean;
  };
  counts: { clients: number; client_cap: number; scouts: number; scout_cap: number };
  weekly_net: Money;
  pending_actions: number;
  game_over: boolean;
  game_over_reason: string;
};

export type ContinueResponse = {
  open_decision_ids: string[];
  state: GameState;
  events: EventDTO[];
  notable: EventDTO[];
};

export type DecisionKind =
  | "contract_expired"
  | "contract_expiring"
  | "agent_contract_expiring"
  | "career.story"
  | "career.promise"
  | "market.rival"
  | "market.loan"
  | "approach";

/** An open obligation derived from world state — it clears when resolved. */
export type Decision = {
  id: string;
  kind: DecisionKind;
  severity: Severity;
  headline: string;
  detail: string;
  player_id: number | null;
  interest_id: number | null;
  weeks_left: number | null;
  actionable: boolean;
  blocked_reason: string;
  href: string;
  extra: {
    is_renewal?: boolean;
    club_name?: string;
    max_wage?: Money;
    current_wage?: Money;
    wage_delta?: Money;
    improves_terms?: boolean;
  } & Record<string, unknown>;
};

export type DecisionsResponse = {
  decisions: Decision[];
  actionable: number;
};

export type InboxResponse = {
  needs_decision: Decision[];
  recent: EventDTO[];
};

export type ClientFlags = {
  injured_weeks: number;
  transfer_listed: boolean;
  seeking_move: boolean;
  interest_count: number;
  agent_contract_expiring: boolean;
};

export type ClientRow = {
  player: PlayerDTO;
  report: ScoutingReportDTO | null;
  club_name: string;
  playing_time: PlayingTime;
  concerns: {text: string; tone: "bad" | "warn"}[];
  wage: Money | null;
  club_contract_weeks_left: number | null;
  commission_pct: number;
  agent_contract_weeks_left: number;
  trust: number;
  trust_label: string;
  flags: ClientFlags;
};

export type InterestDTO = {
  id: number;
  club_id: number;
  club_name: string;
  club_strength: number;
  is_renewal: boolean;
  urgency: number;
  max_wage: Money;
  max_fee: Money;
  expires_in_weeks: number;
  can_negotiate: { ok: boolean; reason: string };
};

export type ClientDetail = ClientRow & {
  club: {
    id: number;
    name: string;
    strength: number;
    prestige: number;
    league_position: number;
  } | null;
  market_value: Money;
  asking_price: Money;
  interests: InterestDTO[];
  can_renew: { ok: boolean; reason: string };
};

export type RegionDTO = {
  id: string;
  name: string;
  country: string;
  star_rating: number;
  scouting_cost: Money;
  expected_ability: number;
  scouts_assigned: number;
  report_count: number;
};

export type ScoutDTO = {
  id: number;
  name: string;
  quality: number;
  wage: Money;
  region_id: string | null;
  region_name: string | null;
  brief_position: string | null;
  brief_max_age: number | null;
  focus_player_id: number | null;
  focus_player_name: string | null;
  precision: number;
};

export type ScoutingReportRow = {
  player: PlayerDTO;
  report: ScoutingReportDTO;
  can_approach: boolean;
  approach_blocked_reason: string;
};

export type ScoutingState = {
  regions: RegionDTO[];
  scouts: ScoutDTO[];
  reports: ScoutingReportRow[];
};

export type ScoutCandidate = {
  index: number;
  name: string;
  quality: number;
  wage: Money;
  signing_fee: Money;
};

export type HQLevelDTO = {
  level: number;
  name: string;
  scout_cap: number;
  client_cap: number;
  precision_bonus: number;
  weekly_cost: Money;
  upgrade_cost: Money;
};

export type HQState = {
  upgrade_cost: Money | null;
  current: HQLevelDTO;
  next: HQLevelDTO | null;
  can_upgrade: { ok: boolean; reason: string };
  weekly_net_now: Money;
  weekly_net_after: Money | null;
};

export type FinanceWeekDTO = {
  week: number;
  retainers: Money;
  commission: Money;
  scout_wages: Money;
  hq_cost: Money;
  support_cost: Money;
  investments: Money;
  region_costs: Money;
  income: Money;
  expenditure: Money;
  net: Money;
};

export type FinancesState = {
  cash: Money;
  weekly_net: Money;
  total_commission: Money;
  total_costs: Money;
  weeks_until_broke: number | null;
  weeks_until_next_window: number;
  history: FinanceWeekDTO[];
};

export type LeagueRow = {
  position: number;
  club_id: number;
  club_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  has_client: boolean;
};

export type LeagueDTO = {
  id: number;
  name: string;
  tier: number;
  round_index: number;
  table: LeagueRow[];
};

export type MetaState = {
  commission: { min_pct: number; max_pct: number };
  calendar: {
    weeks_per_season: number;
    windows: [number, number][];
    window_names: Record<string, string>;
  };
  hq_levels: HQLevelDTO[];
  positions: string[];
  traits: string[];
  trait_blurbs: Record<string, string>;
};

export type SaveSlot = {
  slot: string;
  modified_at: number;
  compatible: boolean;
  agency_name: string | null;
  week: number | null;
};

// ---------------------------------------------------------------------------
// Negotiations
// ---------------------------------------------------------------------------

export type NegotiationStatus = "open" | "accepted" | "walked" | "exhausted" | "abandoned";

export type NegotiationDTO = {
  revision: number;
  id: string;
  kind: "signing" | "renewal" | "deal";
  subject: string;
  status: NegotiationStatus;
  round: number;
  max_rounds: number;
  rounds_left: number;
  axis: "commission_pct" | "package";
  guide:
    | { low_pct: number; high_pct: number }
    | { low_wage: Money; high_wage: Money; low_fee: Money; high_fee: Money };
  bounds:
    | { min_pct: number; max_pct: number }
    | { max_wage: Money; max_fee: Money; asking_price: Money };
  context: Record<string, unknown>;
  history: {
    round: number;
    hint: string;
    status: string;
    offer: { pct: number } | { wage: Money; fee: Money } | null;
  }[];
  last_response: { hint: string; round: number } | null;
  counter: { pct: number } | { wage: Money; fee: Money } | null;
  result?: ActionResultDTO;
};

export type AssessResponse = { trust_delta: number; verdict: string };

// Opening a negotiation can be legitimately refused — a value, not an error.
export type OpenNegotiationResponse = NegotiationDTO | ActionResultDTO;

export function isRefusal(body: unknown): body is ActionResultDTO {
  return (
    typeof body === "object" &&
    body !== null &&
    "ok" in body &&
    typeof (body as { ok: unknown }).ok === "boolean"
  );
}
