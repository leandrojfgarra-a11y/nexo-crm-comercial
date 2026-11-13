import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid, PRIVATE_CUSTOMER_BUCKET } from '@/lib/customer-files'
import { resolveTenantContext } from '@/lib/tenant/context'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return new Response('Not found', { status: 404 })
  const supabase = await createAdminClient()
  const tenant = await resolveTenantContext(supabase)
  const kind = request.nextUrl.searchParams.get('type') === 'contract' ? 'contract' : 'document'
  const query = kind === 'document'
    ? supabase.from('customer_documents').select('storage_path,original_file_name,mime_type,deleted_at').eq('id', id).eq('company_id', tenant.companyId).maybeSingle()
    : supabase.from('customer_contracts').select('storage_path,original_file_name,mime_type').eq('id', id).eq('company_id', tenant.companyId).maybeSingle()
  const { data: record, error } = await query
  if (error || !record || ('deleted_at' in record && record.deleted_at)) return new Response('Not found', { status: 404 })

  const { data: file, error: storageError } = await supabase.storage.from(PRIVATE_CUSTOMER_BUCKET).download(record.storage_path)
  if (storageError || !file) return new Response('File unavailable', { status: 404 })

  const inline = request.nextUrl.searchParams.get('download') !== '1' && (record.mime_type === 'application/pdf' || record.mime_type.startsWith('image/'))
  const safeName = record.original_file_name.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/["\\]/g, '_')
  const disposition = inline ? 'inline' : 'attachment'
  return new Response(file.stream(), {
    headers: {
      'Content-Type': record.mime_type,
      'Content-Disposition': `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(record.original_file_name)}`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    },
  })
}
