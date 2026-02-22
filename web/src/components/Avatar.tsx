import { getInitials } from '../lib/helpers'

interface AvatarProps {
  name: string
  confirmed?: boolean
  size?: number
}

export default function Avatar({ name, confirmed = false, size = 36 }: AvatarProps) {
  const initials = getInitials(name)
  const borderColor = confirmed ? '#22C55E' : '#4B5563'

  return (
    <div className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width: size,
          height: size,
          border: `2px solid ${borderColor}`,
          backgroundColor: '#2E2E2E',
        }}
      >
        <span
          className="font-semibold text-white leading-none"
          style={{ fontSize: Math.max(9, size * 0.3) }}
        >
          {initials}
        </span>
      </div>
      {confirmed && size >= 32 && (
        <div
          className="absolute rounded-full bg-green-primary flex items-center justify-center"
          style={{
            width: Math.max(8, size * 0.22),
            height: Math.max(8, size * 0.22),
            bottom: -1,
            right: -1,
            boxShadow: '0 0 0 2px #111111',
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

/** Compact avatar row for in-progress cards — small circles, no overlap, tight spacing */
export function SmallAvatarRow({ names, total }: { names: { name: string; confirmed: boolean }[]; total: number }) {
  const emptyCount = Math.max(0, total - names.length)
  return (
    <div className="flex items-center" style={{ gap: 4 }}>
      {names.map((n, i) => (
        <Avatar key={i} name={n.name} confirmed={n.confirmed} size={28} />
      ))}
      {Array.from({ length: emptyCount }).map((_, i) => (
        <div
          key={`e-${i}`}
          className="rounded-full shrink-0"
          style={{
            width: 28,
            height: 28,
            border: '2px solid #4B5563',
            backgroundColor: '#1A1A1A',
          }}
        />
      ))}
    </div>
  )
}

/** Large avatar with name below — for next round card */
export function AvatarWithLabel({ name, confirmed }: { name: string; confirmed: boolean }) {
  return (
    <div className="flex flex-col items-center" style={{ gap: 4, width: 52 }}>
      <Avatar name={name} confirmed={confirmed} size={44} />
      <span className="text-text-secondary text-center leading-tight truncate w-full" style={{ fontSize: 11 }}>
        {name.split(' ')[0]}
      </span>
    </div>
  )
}
