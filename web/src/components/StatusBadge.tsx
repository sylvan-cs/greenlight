export default function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { text: string; className: string; pulse?: boolean }> = {
    open: {
      text: 'Gathering',
      className: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    },
    watching: {
      text: 'Watching',
      className: 'bg-primary/15 text-primary border-primary/30',
      pulse: true,
    },
    found: {
      text: 'Time Found',
      className: 'bg-primary/20 text-primary border-primary/40 font-semibold',
    },
    booked: {
      text: 'Booked',
      className: 'bg-primary text-primary-foreground border-primary',
    },
    cancelled: {
      text: 'Cancelled',
      className: 'bg-muted text-muted-foreground border-border',
    },
    invited: {
      text: 'Invited',
      className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    },
  }
  const c = config[status] ?? config.watching
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body font-medium border ${c.className}`}>
      {c.pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
      )}
      {c.text}
    </span>
  )
}
