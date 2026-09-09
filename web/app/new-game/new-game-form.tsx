"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/toaster";
import { buttonClass, cn, inputClass } from "@/components/ui";
import { loadGame, newGame } from "@/lib/actions";
import type { SaveSlot } from "@/lib/types";

export function NewGameForm({ saves }: { saves: SaveSlot[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("Marchant Management");
  const [seed, setSeed] = useState("");
  const [slot, setSlot] = useState("autosave");

  const [loadSlot, setLoadSlot] = useState(saves[0]?.slot ?? "");
  const [manualEntry, setManualEntry] = useState(saves.length === 0);
  const [manualSlot, setManualSlot] = useState("autosave");

  const start = () => {
    startTransition(async () => {
      try {
        const parsedSeed = seed.trim() === "" ? null : Number.parseInt(seed, 10);
        if (parsedSeed !== null && Number.isNaN(parsedSeed)) {
          toast("The seed must be a whole number.", "warn");
          return;
        }
        // newGame() redirects to /new-game/created on success — this call
        // never returns normally when it works.
        await newGame(name.trim() || "Your Agency", parsedSeed, slot.trim());
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not start the game.", "bad");
      }
    });
  };

  const load = () => {
    const target = manualEntry ? manualSlot.trim() : loadSlot;
    if (!target) {
      toast("Pick a save, or type a slot name.", "warn");
      return;
    }
    startTransition(async () => {
      try {
        await loadGame(target);
        router.push("/");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not load that save.", "bad");
      }
    });
  };

  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-xl border border-line bg-panel p-5"
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <label className="block text-sm">
          <span className="t-label mb-1.5 block">Agency name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
            maxLength={48}
          />
        </label>
        <label className="block text-sm">
          <span className="t-label mb-1.5 block">Seed (optional)</span>
          <input
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            placeholder="random"
            inputMode="numeric"
            className={inputClass}
          />
          <span className="t-note mt-1.5 block">
            Same seed, same world — useful for comparing runs.
          </span>
        </label>
        <label className="block text-sm">
          <span className="t-label mb-1.5 block">Save slot</span>
          <input
            value={slot}
            onChange={(event) => setSlot(event.target.value)}
            className={inputClass}
            maxLength={32}
          />
          <span className="t-note mt-1.5 block">
            Lowercase letters, numbers and dashes. The game autosaves here after every week.
          </span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className={cn(buttonClass.primary, "w-full py-2")}
        >
          {pending ? "…" : "Start a new agency"}
        </button>
      </form>

      <form
        className="space-y-3 rounded-xl border border-line bg-panel p-5"
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="t-section">Load a saved game</h2>
          {saves.length > 0 && (
            <button
              type="button"
              onClick={() => setManualEntry((v) => !v)}
              className="text-xs text-faint underline-offset-2 hover:text-fg hover:underline"
            >
              {manualEntry ? "Pick from list" : "Type a slot name"}
            </button>
          )}
        </div>
        {manualEntry ? (
          <div className="flex gap-2">
            <input
              value={manualSlot}
              onChange={(event) => setManualSlot(event.target.value)}
              className={cn(inputClass, "flex-1")}
              maxLength={32}
            />
            <button
              type="submit"
              disabled={pending}
              className={buttonClass.secondary}
            >
              Load
            </button>
          </div>
        ) : saves.length === 0 ? (
          <p className="text-sm text-faint">No saves on disk yet.</p>
        ) : (
          <div className="flex gap-2">
            <select
              value={loadSlot}
              onChange={(event) => setLoadSlot(event.target.value)}
              className={cn(inputClass, "flex-1")}
            >
              {saves.map((save) => (
                <option key={save.slot} value={save.slot} disabled={!save.compatible}>
                  {save.slot}
                  {save.agency_name ? ` — ${save.agency_name}` : ""}
                  {save.week !== null ? `, week ${save.week}` : ""}
                  {!save.compatible ? " (incompatible)" : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending}
              className={buttonClass.secondary}
            >
              Load
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
