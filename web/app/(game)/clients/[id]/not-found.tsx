import Link from "next/link";

export default function ClientNotFound() {
  return (
    <div className="py-16 text-center">
      <p className="mb-3 text-sm text-dim">He is not one of your clients — not any more.</p>
      <Link href="/clients" className="text-sm text-accent hover:underline">
        Back to Clients
      </Link>
    </div>
  );
}
