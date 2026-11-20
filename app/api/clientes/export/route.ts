import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTenantContext } from '@/lib/tenant/context'
import { buildCustomerPdf, buildCustomerWorkbook, validateSelectedCustomerIds } from '@/lib/customer-export'
import type { CustomerExportFilters } from '@/lib/customer-export-types'
import { CustomerExportDataError, loadCustomerExportRecords, normalizeCustomerSearchFilters } from '@/lib/customer-export-data'

export const runtime = 'nodejs'

type ExportBody = {
  format?: unknown
  scope?: unknown
  filters?: unknown
  selectedIds?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function localDateStamp(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export async function POST(request: Request) {
  let body: ExportBody
  try {
    body = await request.json() as ExportBody
  } catch {
    return Response.json({ error: 'Requisição de exportação inválida.' }, { status: 400 })
  }
  if (!isRecord(body.filters)) return Response.json({ error: 'Informe os filtros da exportação.' }, { status: 400 })
  if (body.format !== 'xlsx' && body.format !== 'pdf') return Response.json({ error: 'Formato de exportação inválido.' }, { status: 400 })
  if (body.scope !== 'all' && body.scope !== 'selected') return Response.json({ error: 'Escopo da exportação inválido.' }, { status: 400 })

  const selectedIds = body.scope === 'selected' ? body.selectedIds : null
  if (body.scope === 'selected' && !validateSelectedCustomerIds(selectedIds)) {
    return Response.json({ error: 'Selecione ao menos um cliente válido para exportar.' }, { status: 400 })
  }

  let searchFilters
  try {
    searchFilters = normalizeCustomerSearchFilters({
      searchTerm: body.filters.searchTerm,
      status: body.filters.status,
      productCode: body.filters.productCode,
    })
  } catch (error) {
    if (error instanceof CustomerExportDataError) return Response.json({ error: error.message }, { status: error.status })
    return Response.json({ error: 'Os filtros informados são inválidos.' }, { status: 400 })
  }

  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  try {
    const { records, productLabel } = await loadCustomerExportRecords(
      supabase,
      companyId,
      searchFilters,
      body.scope === 'selected' ? selectedIds as string[] : null,
    )
    const generatedAt = new Date()
    const filters: CustomerExportFilters = {
      ...searchFilters,
      productLabel,
      scope: body.scope,
    }
    const file = body.format === 'xlsx'
      ? buildCustomerWorkbook(records, filters, generatedAt)
      : await buildCustomerPdf(records, filters, generatedAt)
    const extension = body.format === 'xlsx' ? 'xlsx' : 'pdf'
    const contentType = body.format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf'
    const filename = `clientes_nexo_${localDateStamp(generatedAt)}.${extension}`
    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(file.byteLength),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    if (error instanceof CustomerExportDataError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json({ error: 'Não foi possível gerar a exportação dos clientes.' }, { status: 500 })
  }
}
