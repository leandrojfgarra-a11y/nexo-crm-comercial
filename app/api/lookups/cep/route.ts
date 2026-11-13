import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  await createAdminClient()
  const cep = new URL(request.url).searchParams.get('cep')?.replace(/\D/g, '') ?? ''
  if (!/^\d{8}$/.test(cep)) return NextResponse.json({ error: 'Informe um CEP com 8 dígitos.' }, { status: 400 })
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(7000), cache: 'no-store' })
    if (!response.ok) return NextResponse.json({ error: 'Consulta de CEP indisponível.' }, { status: 502 })
    const raw = await response.json() as Record<string, unknown>
    if (raw.erro) return NextResponse.json({ error: 'CEP não encontrado.' }, { status: 404 })
    return NextResponse.json({ postal_code: raw.cep, address_line: raw.logradouro, address_extra: raw.complemento, district: raw.bairro, city: raw.localidade, state: raw.uf }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar o CEP agora. Tente novamente mais tarde.' }, { status: 502 })
  }
}
