import { Link } from 'react-router-dom'

export default function Welcome() {
  return (
    <div className="relative flex flex-col items-center justify-center h-full px-6 w-full max-w-[480px] mx-auto">
      <div className="flex flex-col items-center gap-3 mb-20">
        <h1 className="font-display text-5xl font-bold tracking-tight">The Starter</h1>
        <p className="text-text-secondary text-lg">Stop texting. Start playing.</p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-[320px]">
        <Link
          to="/signup"
          className="block w-full text-center py-4 bg-green-primary hover:bg-green-hover text-white font-bold rounded-xl transition-colors text-[15px]"
          style={{ height: 52, lineHeight: '52px', padding: 0 }}
        >
          Sign Up
        </Link>
        <Link
          to="/login"
          className="block w-full text-center py-4 text-white font-semibold rounded-xl hover:bg-dark-card transition-colors text-[15px]"
          style={{ border: '1px solid #2E2E2E', backgroundColor: 'rgba(26,26,26,0.5)' }}
        >
          Log In
        </Link>
      </div>
      <div className="absolute bottom-8 flex gap-4 text-text-secondary text-xs">
        <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
        <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
      </div>
    </div>
  )
}
