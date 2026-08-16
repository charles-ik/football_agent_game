"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/toaster";
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
        className="space-y-4 rounded border border-line bg-panel p-5"
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-dim">Agency name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded border border-line bg-panel-2 px-3 py-1.5 outline-none focus:border-accent"
            maxLength={48}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-dim">Seed (optional)</span>
          <input
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            placeholder="random"
            inputMode="numeric"
            className="w-full rounded border border-line bg-panel-2 px-3 py-1.5 outline-none focus:border-accent"
          />
          <span className="mt-1 block text-xs text-faint">
            Same seed, same world — useful for comparing runs.
          </span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-dim">Save slot</span>
          <input
            value={slot}
            onChange={(event) => setSlot(event.target.value)}
            className="w-full rounded border border-line bg-panel-2 px-3 py-1.5 outline-none focus:border-accent"
            maxLength={32}
          />
          <span className="mt-1 block text-xs text-faint">
            Lowercase letters, numbers and dashes. The game autosaves here after every week.
          </span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-accent px-4 py-2 font-semibold text-ink hover:bg-accent/90 disabled:opacity-50"
        >
          {pending ? "…" : "Start a new agency"}
        </button>
      </form>

      <form
        className="space-y-3 rounded border border-line bg-panel p-5"
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-dim">Load a saved game</h2>
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
              className="flex-1 rounded border border-line bg-panel-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
              maxLength={32}
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded border border-line px-4 py-1.5 text-sm hover:bg-panel-2 disabled:opacity-50"
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
              className="flex-1 rounded border border-line bg-panel-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
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
              className="rounded border border-line px-4 py-1.5 text-sm hover:bg-panel-2 disabled:opacity-50"
            >
              Load
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
