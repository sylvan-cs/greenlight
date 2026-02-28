import { getInitials } from '../lib/helpers'

interface AvatarProps {
  name: string
  confirmed?: boolean
  size?: number
}

export default function Avatar({ name, confirmed = false, size = 36 }: AvatarProps) {
  const initials = getInitials(name)
  const fontSize = Math.max(9, size * 0.3)

  return (
    <div className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <div
        className={`rounded-full flex items-center justify-center font-body font-semibold ${
          confirmed
            ? 'bg-primary/15 text-primary ring-2 ring-primary/40'
            : 'bg-muted text-muted-foreground'
        }`}
        style={{ width: size, height: size }}
      >
        <span className="leading-none" style={{ fontSize }}>
          {initials}
        </span>
      </div>
      {confirmed && size >= 32 && (
        <div
          className="absolute rounded-full bg-primary flex items-center justify-center"
          style={{
            width: Math.max(8, size * 0.22),
            height: Math.max(8, size * 0.22),
            bottom: -1,
            right: -1,
            boxShadow: '0 0 0 2px var(--color-background)',
          }}
        >
          {size >= 36 && (
            <svg width={size * 0.14} height={size * 0.14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      )}
    </div>
  )
}

/** Compact avatar row for in-progress cards */
export function SmallAvatarRow({ names, total }: { names: { name: string; confirmed: boolean }[]; total: number }) {
  const emptyCount = Math.max(0, total - names.length)
  return (
    <div className="flex items-center gap-1">
      {names.map((n, i) => (
        <Avatar key={i} name={n.name} confirmed={n.confirmed} size={28} />
      ))}
      {Array.from({ length: emptyCount }).map((_, i) => (
        <div
          key={`e-${i}`}
          className="rounded-full shrink-0 border-2 border-muted-foreground/30 bg-card"
          style={{ width: 28, height: 28 }}
        />
      ))}
    </div>
  )
}

/** Large avatar with name below — for next round card */
export function AvatarWithLabel({ name, confirmed }: { name: string; confirmed: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 w-[52px]">
      <Avatar name={name} confirmed={confirmed} size={44} />
      <span className="text-muted-foreground font-body text-center leading-tight truncate w-full text-[11px]">
        {name.split(' ')[0]}
      </span>
    </div>
  )
}
