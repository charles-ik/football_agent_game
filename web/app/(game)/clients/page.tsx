import { SceneBanner } from "@/components/scene-banner";
// Clients — the roster.

import { EmptyState, Panel, ScreenHeader } from "@/components/ui";
import { getClients } from "@/lib/api";

import { ClientsTable } from "./clients-table";

export default async function ClientsPage() {
  const clients = await getClients();

  const unsettled = clients.filter((c) => c.trust < 55).length;
  const note =
    clients.length === 0
      ? undefined
      : unsettled > 0
        ? `${clients.length} on the books, ${unsettled} of them unsettled. Click a row for the detail.`
        : `${clients.length} on the books, all settled. Click a row for the detail.`;

  return (
    <div>
      <ScreenHeader title="Clients" note={note} />
      <div className="mb-5"><SceneBanner image="career-tunnel" eyebrow="People behind the performances" title="A career is a shared journey." description="Understand their ambition, protect their trust, and help every player find their next chapter."/></div>
      {clients.length === 0 ? (
        <EmptyState
          title="You have no clients."
          hint="An agency with nobody on its books earns nothing at all. Put a scout into a region, wait for a report, and sign the first name you can afford to approach."
          action={{ href: "/scouting", label: "Go scouting" }}
        />
      ) : (
        <Panel className="overflow-hidden">
          <ClientsTable clients={clients} />
        </Panel>
      )}
    </div>
  );
}
