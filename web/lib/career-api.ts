import "server-only";

import { z } from "zod";
import { api } from "@/lib/api";

const timelineSchema = z.object({
  week: z.number(), kind: z.string(), message: z.string(), trust_delta: z.number(),
});
const goalSchema = z.object({
  id: z.string(), kind: z.string(), title: z.string(), target: z.number(), progress: z.number(),
  created_week: z.number(), deadline_week: z.number(), status: z.string(),
});
const promiseSchema = z.object({
  id: z.string(), player_id: z.number(), kind: z.string(), status: z.string(),
  created_week: z.number(), deadline_week: z.number(),
});
const storySchema = z.object({
  id: z.string(), player_id: z.number(), kind: z.string(), title: z.string(), body: z.string(),
  status: z.string(), created_week: z.number(),
  options: z.array(z.object({ id: z.string(), label: z.string(), consequence: z.string() })),
});
const clientCareerSchema = z.object({
  player_id: z.number(), name: z.string(), trait: z.string(), trust: z.number(),
  goal: goalSchema.nullish(), promises: z.array(promiseSchema), stories: z.array(storySchema),
  timeline: z.array(timelineSchema), trust_explanation: z.array(z.string()),
});
const careersSchema = z.object({
  week: z.number(), clients: z.array(clientCareerSchema),
  alumni: z.array(z.object({
    player_id: z.number(), name: z.string(), joined_week: z.number(), left_week: z.number(),
    reason: z.string(), trust: z.number(), timeline: z.array(timelineSchema),
  })),
});

export type ClientCareer = z.infer<typeof clientCareerSchema>;
export type CareersState = z.infer<typeof careersSchema>;
export async function getCareers(): Promise<CareersState> {
  return careersSchema.parse(await api<unknown>("/api/careers"));
}
