import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-950 px-5 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-white">Page not found</h1>
      <p className="mt-2 text-sm text-slate-400">The page you requested is not part of this workspace.</p>
      <Link className="button-secondary mt-6" to="/">Return to workspace</Link>
    </main>
  )
}
