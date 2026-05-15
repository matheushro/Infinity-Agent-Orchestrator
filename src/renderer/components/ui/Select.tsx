// Reusable labeled select. Feature-agnostic, themed via CSS variables.

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  className?: string
}

export function Select({
  label,
  value,
  options,
  onChange,
  className = '',
}: SelectProps): JSX.Element {
  return (
    <label
      className={`flex items-center gap-2 text-[11.5px] ${className}`}
      style={{ color: 'var(--fg-3)' }}
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[6px] px-2 py-1 text-[11.5px] outline-none"
        style={{
          background: 'color-mix(in oklch, var(--fg) 5%, transparent)',
          color: 'var(--fg)',
          border: '1px solid var(--line-2)',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
