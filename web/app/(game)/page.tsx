// The Inbox — the home screen. Decisions at the top in the accent colour,
// the notable feed below grouped by week. Empty means "Nothing to report."
// and the Continue button is the only thing left on screen, which is the
// correct feeling.

import { EventList, EventRow } from "@/components/event-list";
import { getInbox } from "@/lib/api";

export default async function InboxPage() {
  const inbox = await getInbox(60);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">
          Needs a decision
        </h1>
        {inbox.needs_decision.length === 0 ? (
          <p className="text-sm text-faint">Nothing needs you.</p>
        ) : (
          <div className="divide-y divide-line/50 rounded border border-accent/25 bg-panel">
            {inbox.needs_decision.map((event, index) => (
              <EventRow key={index} event={event} showWeek />
            ))}
          </div>
        )}
      </section>

      <section>
        <h1 className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">Recent</h1>
        {inbox.recent.length === 0 && inbox.needs_decision.length === 0 ? (
          <p className="text-sm text-faint">Nothing to report.</p>
        ) : (
          <EventList events={inbox.recent} grouped />
        )}
      </section>
    </div>
  );
}
