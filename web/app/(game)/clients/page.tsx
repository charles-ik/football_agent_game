// Clients — one dense row per client: ability as a range bar (never a
// number), trust as a mood with the number secondary, and flags for the
// things that cost you money when ignored.

import { getClients } from "@/lib/api";

import { ClientsTable } from "./clients-table";

export default async function ClientsPage() {
  const clients = await getClients();

  if (clients.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-faint">
        You have no clients. Scout and sign someone.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-line bg-panel">
      <ClientsTable clients={clients} />
    </div>
  );
}
