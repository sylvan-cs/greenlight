import { Link } from 'react-router-dom'

export default function Welcome() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-10">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-5xl font-display tracking-tight text-foreground">
            The Starter
          </h1>
          <div className="w-8 h-[3px] bg-primary rounded-full" />
          <p className="text-sm font-body text-muted-foreground mt-1 text-center">
            Group tee times, minus the group text.
          </p>
        </div>

        {/* Actions */}
        <div className="w-full flex flex-col gap-3">
          <Link
            to="/signup"
            className="w-full h-14 flex items-center justify-center bg-primary hover:bg-green-hover text-primary-foreground font-bold rounded-xl transition-colors text-base"
          >
            Sign Up
          </Link>
          <Link
            to="/login"
            className="w-full h-14 flex items-center justify-center border border-border text-foreground font-semibold rounded-xl hover:bg-muted/50 transition-colors text-base"
          >
            Log In
          </Link>
        </div>
      </div>

      {/* Footer links */}
      <div className="absolute bottom-8 flex gap-4 text-muted-foreground text-xs font-body">
        <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
        <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
      </div>
    </div>
  )
}
