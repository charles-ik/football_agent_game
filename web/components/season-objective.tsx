import Link from "next/link";
import { Check, ArrowUpRight } from "lucide-react";
import type { ManagementDTO } from "@/lib/management-api";

export const objectiveLabels: Record<string, { title: string; unit: string; href: string; action: string }> = {
  growth: { title: "Build your client roster", unit: "net new clients", href: "/scouting", action: "Find your next client" },
  careers: { title: "Make career-changing deals", unit: "client deals", href: "/market", action: "Explore the market" },
  stability: { title: "Build a stable business", unit: "consecutive solvent weeks", href: "/finances", action: "Review your cash flow" },
};

export function SeasonObjective({ objective }: { objective: ManagementDTO["objective"] }) {
  const goal = objectiveLabels[objective.id];
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="t-label">Season {objective.season} ambition</span>
      <span className="inline-flex items-center gap-1 text-xs text-accent">{objective.completed && <Check size={14} />}+{objective.reward} reputation {objective.completed ? "earned" : "reward"}</span>
    </div>
    <h3 className="office-title text-2xl">{goal?.title ?? objective.id}</h3>
    <progress className="h-2 w-full accent-[var(--color-accent)]" value={objective.completed ? objective.target : Math.min(objective.progress, objective.target)} max={objective.target} aria-label="Season objective progress" />
    <p className="text-sm text-dim">{objective.completed ? "Ambition achieved. Keep building your agency." : <><span className="num text-fg">{objective.progress} / {objective.target}</span> {goal?.unit}</>}</p>
    <p className="t-note">Progress and rewards are settled when the week advances.</p>
    <Link href={objective.completed ? "/season-review" : goal?.href ?? "/agency"} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
      {objective.completed ? "See your agency record" : goal?.action ?? "Manage your ambition"}<ArrowUpRight size={15} />
    </Link>
  </div>;
}
