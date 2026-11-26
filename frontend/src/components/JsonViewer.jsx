export default function JsonViewer({ value, title = 'JSON data', className = '' }) {
  return (
    <section className={className}>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</h3>
      <pre className="max-h-[520px] overflow-auto rounded-xl border border-border bg-surface-2/90 p-4 font-mono text-[11px] leading-5 text-text/90 shadow-inner">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </section>
  )
}
