// Reusable button. Feature-agnostic — variants/sizes only, no business logic.
import type { ButtonHTMLAttributes, CSSProperties } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md'

const SIZES: Record<Size, string> = {
  sm: 'px-3 h-8 text-[12px]',
  md: 'px-3 h-9 text-[12.5px]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const VARIANT_STYLES: Record<Variant, CSSProperties> = {
  primary: { background: 'var(--fg)', color: 'var(--bg)' },
  secondary: {
    background: 'color-mix(in oklch, var(--fg) 6%, transparent)',
    color: 'var(--fg)',
    border: '1px solid var(--line-2)',
  },
  ghost: { background: 'transparent', color: 'var(--fg-2)' },
}

export function Button({
  variant = 'primary',
  size = 'sm',
  className = '',
  style,
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      {...props}
      className={`rounded-[8px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${SIZES[size]} ${className}`}
      style={{ ...VARIANT_STYLES[variant], ...style }}
    />
  )
}
