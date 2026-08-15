/** Schema-first custody banner — CEO / Outcome / Ship paths. */
export function SchemaCustodyBanner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-secondary/30 bg-secondary/10 px-md py-sm text-[12px] text-on-surface ${className}`}
      role="note"
    >
      <strong className="text-secondary">Schema-first.</strong> Que uses
      schemas + scrubbed samples only — never full lake / managed row custody
      for AI planning. Warehouse stays system of record.
    </div>
  )
}
