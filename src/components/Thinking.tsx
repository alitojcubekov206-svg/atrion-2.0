export default function Thinking({ label = "AI is thinking" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <div className="flex gap-1.5">
        <span className="thinking-dot h-2 w-2 rounded-full bg-accent" />
        <span className="thinking-dot h-2 w-2 rounded-full bg-accent" />
        <span className="thinking-dot h-2 w-2 rounded-full bg-accent2" />
      </div>
      <span>{label}…</span>
    </div>
  );
}
