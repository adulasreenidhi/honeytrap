import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info)
  }

  reset = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-bg px-5">
          <section className="card max-w-lg p-7 text-center">
            <AlertTriangle className="mx-auto text-warning" size={26} aria-hidden="true" />
            <h1 className="mt-4 text-xl font-bold text-text">This view could not be displayed</h1>
            <p className="mt-2 text-sm leading-6 text-muted">The application encountered an unexpected error. Reload this view to continue.</p>
            <button className="btn-secondary button-secondary mt-5" onClick={this.reset} type="button">
              <RotateCcw size={14} aria-hidden="true" />Try again
            </button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}
