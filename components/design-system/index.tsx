'use client'

import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FormHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import styles from './design-system.module.css'

const scoped = (className = '') => `${styles.scope} ${className}`.trim()

const surfaceStyle: CSSProperties = {
  background: 'var(--surface)',
  borderColor: 'var(--border)',
  color: 'var(--text)',
}

const compactControl = 'min-h-9 w-full rounded-md border px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60'

export type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
  loadingText?: string
  startIcon?: ReactNode
  endIcon?: ReactNode
}

const buttonVariants: Record<NonNullable<AppButtonProps['variant']>, string> = {
  primary: 'border-transparent bg-[var(--primary)] text-white hover:brightness-95',
  secondary: 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]',
  ghost: 'border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
  danger: 'border-transparent bg-[var(--color-danger)] text-white hover:brightness-95',
}

export function AppButton({
  variant = 'primary', size = 'md', loading = false, loadingText,
  startIcon, endIcon, className = '', children, disabled, type = 'button', ...props
}: AppButtonProps) {
  const isDisabled = disabled || loading
  return (
    <button
      {...props}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={scoped(`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${size === 'sm' ? 'px-2.5 text-xs' : 'px-3.5 text-sm'} ${buttonVariants[variant]} ${className}`)}
    >
      {loading ? <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent" /> : startIcon}
      {loading ? (loadingText ?? children) : children}
      {!loading && endIcon}
    </button>
  )
}

export type AppInputProps = InputHTMLAttributes<HTMLInputElement>
export function AppInput({ className = '', style, ...props }: AppInputProps) {
  return <input {...props} style={{ ...surfaceStyle, ...style }} className={scoped(`${compactControl} ${className}`)} />
}

export type AppSelectProps = SelectHTMLAttributes<HTMLSelectElement>
export function AppSelect({ className = '', style, children, ...props }: AppSelectProps) {
  return <select {...props} style={{ ...surfaceStyle, ...style }} className={scoped(`${compactControl} ${className}`)}>{children}</select>
}

export type AppTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>
export function AppTextarea({ className = '', style, ...props }: AppTextareaProps) {
  return <textarea {...props} style={{ ...surfaceStyle, ...style }} className={scoped(`${compactControl} min-h-24 resize-y ${className}`)} />
}

type FormFieldProps = {
  label: string
  control: ReactElement<Record<string, unknown>>
  controlAddon?: ReactNode
  id?: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
}

export function FormField({ label, control, controlAddon, id, hint, error, required, className = '' }: FormFieldProps) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const enhanced = isValidElement(control)
    ? cloneElement(control, {
      id: controlId,
      required: required || undefined,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy,
      'aria-required': required || undefined,
      style: {
        ...((control.props.style as CSSProperties | undefined) ?? {}),
        ...(error ? { borderColor: 'var(--color-danger)' } : {}),
      },
    })
    : control

  return (
    <div className={scoped(`grid min-w-0 gap-1.5 ${className}`)}>
      <label htmlFor={controlId} className="text-xs font-semibold text-[var(--text)]">
        {label}{required && <span aria-hidden="true" className="ml-1 text-[var(--color-danger)]">*</span>}
      </label>
      {controlAddon ? <div className="flex min-w-0 items-end gap-2"><div className="min-w-0 flex-1">{enhanced}</div>{controlAddon}</div> : enhanced}
      {hint && <p id={hintId} className="text-xs text-[var(--text-muted)]">{hint}</p>}
      {error && <p id={errorId} className="text-xs font-medium text-[var(--color-danger)]" role="alert">{error}</p>}
    </div>
  )
}

type FormSectionProps = {
  title: string
  description?: string
  aside?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

export function FormSection({ title, description, aside, children, className = '', contentClassName = '' }: FormSectionProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={scoped(`min-w-0 rounded-lg border p-3 sm:p-4 ${className}`)} style={surfaceStyle}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h2 id={headingId} className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
        </div>
        {aside}
      </header>
      <div className={`grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4 ${contentClassName}`.trim()}>{children}</div>
    </section>
  )
}

export function FormActions({ children, className = '', sticky = false }: { children: ReactNode; className?: string; sticky?: boolean }) {
  return (
    <footer className={scoped(`flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-end ${sticky ? 'sticky bottom-0 z-10 -mx-4 px-4 pb-3' : ''} ${className}`)} style={{ ...surfaceStyle, borderColor: 'var(--border)' }}>
      {children}
    </footer>
  )
}

export type FormTab = { value: string; label: string; content: ReactNode; disabled?: boolean }
export function nextFormTabIndex(currentIndex: number, key: string, enabledCount: number): number | null {
  if (enabledCount < 1) return null
  if (key === 'Home') return 0
  if (key === 'End') return enabledCount - 1
  if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1 + enabledCount) % enabledCount
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + enabledCount) % enabledCount
  return null
}

export function FormTabs({ tabs, value, onValueChange, ariaLabel = 'Seções do formulário', className = '' }: {
  tabs: FormTab[]
  value: string
  onValueChange: (value: string) => void
  ariaLabel?: string
  className?: string
}) {
  const tabsId = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const enabledTabs = tabs.filter(tab => !tab.disabled)
  const selected = tabs.find(tab => tab.value === value && !tab.disabled) ?? enabledTabs[0]
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: FormTab) => {
    const currentIndex = enabledTabs.findIndex(item => item.value === tab.value)
    const nextIndex = nextFormTabIndex(currentIndex, event.key, enabledTabs.length)
    if (nextIndex === null) return
    event.preventDefault()
    const nextTab = enabledTabs[nextIndex]
    onValueChange(nextTab.value)
    refs.current[tabs.indexOf(nextTab)]?.focus()
  }
  if (!selected) return null
  return (
    <div className={scoped(className)}>
      <div role="tablist" aria-label={ariaLabel} className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--border)' }}>
        {tabs.map((tab, index) => {
          const active = tab.value === selected.value
          const safeValue = encodeURIComponent(tab.value)
          const tabId = `${tabsId}-tab-${safeValue}`
          const panelId = `${tabsId}-panel-${safeValue}`
          return <button key={tab.value} ref={element => { refs.current[index] = element }} id={tabId} type="button" role="tab" aria-selected={active} aria-controls={panelId} tabIndex={active ? 0 : -1} disabled={tab.disabled} onClick={() => onValueChange(tab.value)} onKeyDown={event => handleKeyDown(event, tab)} className={`min-h-9 shrink-0 border-b-2 px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'} disabled:cursor-not-allowed disabled:opacity-50`}>{tab.label}</button>
        })}
      </div>
      <div id={`${tabsId}-panel-${encodeURIComponent(selected.value)}`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${encodeURIComponent(selected.value)}`} tabIndex={0} className="pt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40">{selected.content}</div>
    </div>
  )
}

export function FilterBar({ children, actions, className = '', onSubmit, ...props }: FormHTMLAttributes<HTMLFormElement> & { actions?: ReactNode }) {
  return (
    <form {...props} onSubmit={onSubmit} role={props.role ?? 'search'} className={scoped(`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:flex-wrap sm:items-end ${className}`)} style={surfaceStyle}>
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
    </form>
  )
}

export function MetricCard({ label, value, detail, accent = 'var(--primary)', icon, className = '' }: {
  label: string
  value: ReactNode
  detail?: string
  accent?: string
  icon?: ReactNode
  className?: string
}) {
  return (
    <article className={scoped(`min-w-0 rounded-lg border p-3 shadow-sm ${className}`)} style={{ ...surfaceStyle, borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
        {icon && <span aria-hidden="true" className="text-[var(--primary)]">{icon}</span>}
      </div>
      <p className="mt-1 text-xl font-bold tracking-tight">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{detail}</p>}
    </article>
  )
}

export function EmptyState({ title, description, action, icon, className = '' }: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={scoped(`flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center ${className}`)} style={surfaceStyle} role="status">
      {icon && <div aria-hidden="true" className="mb-2 text-[var(--text-muted)]">{icon}</div>}
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="mt-1 max-w-md text-xs text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
