"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/toaster";
import { loadGame, newGame } from "@/lib/actions";

export function NewGameForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("Marchant Management");
  const [seed, setSeed] = useState("");
  const [slot, setSlot] = useState("autosave");
  const [createdSeed, setCreatedSeed] = useState<number | null>(null);

  const [loadSlot, setLoadSlot] = useState("autosave");

  const start = () => {
    startTransition(async () => {
      try {
        const parsedSeed = seed.trim() === "" ? null : Number.parseInt(seed, 10);
        if (parsedSeed !== null && Number.isNaN(parsedSeed)) {
          toast("The seed must be a whole number.", "warn");
          return;
        }
        const result = await newGame(name.trim() || "Your Agency", parsedSeed, slot.trim());
        setCreatedSeed(result.seed);
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not start the game.", "bad");
      }
    });
  };

  const load = () => {
    startTransition(async () => {
      try {
        await loadGame(loadSlot.trim());
        router.push("/");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not load that save.", "bad");
      }
    });
  };

  if (createdSeed !== null) {
    return (
      <div className="rounded border border-good/40 bg-panel p-5">
        <h2 className="mb-2 text-sm font-semibold text-good">The agency is open.</h2>
        <p className="mb-1 text-sm text-dim">
          World seed <span className="num font-semibold text-fg">{createdSeed}</span> — note it
          down. Same seed, same world, if you ever want to replay it.
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 w-full rounded bg-accent px-4 py-2 font-semibold text-ink hover:bg-accent/90"
        >
          Start week 1
        </button>
      </div>
    );
  }

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
        <h2 className="text-sm font-semibold text-dim">Load a saved game</h2>
        <div className="flex gap-2">
          <input
            value={loadSlot}
            onChange={(event) => setLoadSlot(event.target.value)}
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
      </form>
    </div>
  );
}
