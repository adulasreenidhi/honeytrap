export default function FormField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
  error,
  hint,
  as = 'input',
  options = [],
  min,
  max,
  step,
  disabled = false,
}) {
  const sharedProps = {
    className: 'text-field input mt-1.5',
    disabled,
    id,
    onChange: (event) => onChange(event.target.value),
    required,
    value,
  }
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </label>
      {as === 'textarea' ? (
        <textarea {...sharedProps} className={`${sharedProps.className} min-h-24 resize-y`} placeholder={placeholder} />
      ) : as === 'select' ? (
        <select {...sharedProps}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : (
        <input {...sharedProps} max={max} min={min} placeholder={placeholder} step={step} type={type} />
      )}
      {hint && <p className="mt-1.5 text-[11px] leading-5 text-faint">{hint}</p>}
      {error && <p className="mt-1.5 text-xs font-medium text-danger" role="alert">{error}</p>}
    </div>
  )
}
