// Reusable button. Feature-agnostic — variants/sizes only, no business logic.
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40',
  secondary: 'bg-slate-700 text-slate-100 hover:bg-slate-600',
  ghost: 'text-slate-300 hover:bg-slate-800'
}

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-3 py-1 text-sm'
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({
  variant = 'primary',
  size = 'sm',
  className = '',
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      {...props}
      className={`rounded font-medium ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    />
  )
}
