'use client'

export function ConfirmSubmit({ children, message, className }: { children: React.ReactNode; message: string; className: string }) {
  return <button className={className} onClick={event => { if (!window.confirm(message)) event.preventDefault() }}>{children}</button>
}
