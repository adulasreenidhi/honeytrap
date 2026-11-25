import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-navy-950 lg:flex">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Topbar />
        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
          {children}
        </main>
      </div>
    </div>
  )
}
