// Minimal stroke-icon system: thin lines, currentColor, sharp geometry.
import type { ReactNode, SVGProps } from 'react'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'stroke'> {
  size?: number
  stroke?: number
  children: ReactNode
}

export function Icon({ size = 14, stroke = 1.6, children, ...rest }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}

const make =
  (d: string, viewBox = '0 0 24 24') =>
  (p: Omit<IconProps, 'children'> = {}): JSX.Element =>
    (
      <Icon {...p}>
        <path d={d} />
      </Icon>
    )

export const IPlus = make('M12 5v14M5 12h14')
export const IMinus = make('M5 12h14')
export const ISearch = make('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.35-4.35')
export const IGear = make(
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.55V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.13 16.9l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1.04H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.1 4.06l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.55V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.04 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.42.16.78.46 1.04.83a1.7 1.7 0 0 0 .51.21h.05a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.55 1.04z',
)
export const IChevDown = make('M6 9l6 6 6-6')
export const IChevRight = make('M9 6l6 6-6 6')
export const IFolder = make('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z')
export const ITarget = make('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4z')
export const ISun = make('M12 4V2M12 22v-2M4.93 4.93L3.51 3.51M20.49 20.49l-1.42-1.42M4 12H2M22 12h-2M4.93 19.07l-1.42 1.42M20.49 3.51l-1.42 1.42M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z')
export const IMoon = make('M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z')
export const IGrid = make('M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z')
export const IKeyboard = make('M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12')
export const ICursor = make('M5 3l14 7-6 2-2 6-6-15z')
export const IText = make('M6 7h12M12 7v10M9 17h6')
export const IHand = make('M9 11V5a2 2 0 1 1 4 0v6M13 11V4a2 2 0 1 1 4 0v8M17 11V6a2 2 0 1 1 4 0v9a7 7 0 0 1-7 7H11a5 5 0 0 1-4-2l-5-7 1-1a2 2 0 0 1 3 0l3 3')
export const IFit = make('M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4')
export const IClose = make('M6 6l12 12M6 18L18 6')
export const ILink = make('M10 14a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 6M14 10a5 5 0 0 0-7.07 0l-2.83 2.83a5 5 0 0 0 7.07 7.07L13 18')
export const ITrash = make('M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3')
export const IPalette = make('M12 21a9 9 0 1 1 0-18 9 9 0 0 1 9 9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1 3.74A1.5 1.5 0 0 1 14 21h-2zM7.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM10 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM14 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z')
export const ISidebarClose = make('M4 6h16M4 12h10M4 18h16M19 9l-3 3 3 3')
export const ISidebarOpen = make('M4 6h16M4 12h10M4 18h16M16 9l3 3-3 3')
export const IMap = make('M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14')
