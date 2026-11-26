import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-5 text-center">
      <p className="font-mono text-sm font-bold text-brand">404</p>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-text">Page not found</h1>
      <p className="mt-2 text-sm text-muted">The page you requested is not part of this workspace.</p>
      <Link className="btn-secondary button-secondary mt-6" to="/">Return to workspace</Link>
    </main>
  )
}
