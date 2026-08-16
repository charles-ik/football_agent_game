export default function Loading() {
  return (
    <div className="space-y-3 pt-2" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded border border-line bg-panel" />
      ))}
    </div>
  );
}
