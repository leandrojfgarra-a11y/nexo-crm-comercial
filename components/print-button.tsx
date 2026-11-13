'use client'

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white print:hidden">Imprimir / Salvar como PDF</button>
}
