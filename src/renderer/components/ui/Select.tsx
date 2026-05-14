// Reusable labeled select. Feature-agnostic.

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
  className = ''
}: SelectProps): JSX.Element {
  return (
    <label className={`flex items-center gap-2 text-xs text-slate-300 ${className}`}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
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
