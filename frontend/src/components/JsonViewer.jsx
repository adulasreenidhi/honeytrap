export default function JsonViewer({ value, title = 'JSON data', className = '' }) {
  return (
    <section className={className}>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">{title}</h3>
      <pre className="max-h-[520px] overflow-auto rounded-lg border border-white/[0.05] bg-black/20 p-4 font-mono text-[11px] leading-5 text-slate-300">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </section>
  )
}
