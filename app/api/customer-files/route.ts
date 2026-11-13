import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DOCUMENT_CATEGORIES, isUuid, PRIVATE_CUSTOMER_BUCKET, safeOriginalName, validateCustomerFile } from '@/lib/customer-files'
import { resolveTenantContext } from '@/lib/tenant/context'

const contractStatuses = ['draft','sent','awaiting_signature','signed','active','closed','cancelled']
const uuidLike = (value: string) => isUuid(value)
const validDate = (value: string | null) => value === null || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value)

function back(request: NextRequest, customerId: string, tab: 'documents' | 'contracts', file: string) {
  return NextResponse.redirect(new URL(`/clientes/${customerId}?tab=${tab}&file=${file}#${tab}`, request.url), 303)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) return new Response('Forbidden', { status: 403 })

  const form = await request.formData()
  const intent = String(form.get('intent') ?? '')
  const customerId = String(form.get('customer_id') ?? '')
  const tab = intent.includes('contract') ? 'contracts' : 'documents'
  if (!uuidLike(customerId)) return NextResponse.redirect(new URL('/clientes', request.url), 303)

  const supabase = await createAdminClient()
  const tenant = await resolveTenantContext(supabase)
  const { data: customer, error: customerError } = await supabase.from('customers').select('id').eq('id', customerId).eq('company_id', tenant.companyId).maybeSingle()
  if (customerError || !customer) return back(request, customerId, tab, 'customer-not-found')
  const storage = supabase.storage.from(PRIVATE_CUSTOMER_BUCKET)

  if (intent === 'upload_document' || intent === 'replace_document' || intent === 'upload_contract') {
    const file = form.get('file')
    if (!(file instanceof File)) return back(request, customerId, tab, 'file-required')
    const kind = intent === 'upload_contract' ? 'contract' : 'document'
    const validated = await validateCustomerFile(file, kind)
    if ('error' in validated) return back(request, customerId, tab, 'invalid-file')
    const isContract = intent === 'upload_contract'
    const extension = validated.extension
    const objectPath = `${customerId}/${isContract ? 'contracts' : 'documents'}/${crypto.randomUUID()}.${extension}`

    if (intent === 'replace_document') {
      const documentId = String(form.get('document_id') ?? '')
      if (!uuidLike(documentId)) return back(request, customerId, 'documents', 'document-not-found')
      const { data: oldDocument, error } = await supabase.from('customer_documents').select('id,storage_path').eq('id', documentId).eq('customer_id', customerId).eq('company_id', tenant.companyId).is('deleted_at', null).maybeSingle()
      if (error || !oldDocument) return back(request, customerId, 'documents', 'document-not-found')
      const { error: uploadError } = await storage.upload(objectPath, file, { contentType: validated.mimeType, upsert: false })
      if (uploadError) return back(request, customerId, 'documents', 'storage-unavailable')
      const currentUser = (await supabase.auth.getUser()).data.user
      const userId = currentUser?.id ?? null
      const { error: updateError } = await supabase.from('customer_documents').update({
        storage_path: objectPath, original_file_name: safeOriginalName(file.name), mime_type: validated.mimeType,
        file_size: file.size, uploaded_by: userId, updated_by: userId, updated_at: new Date().toISOString(),
        uploaded_by_email: currentUser?.email ?? null, updated_by_email: currentUser?.email ?? null,
      }).eq('id', documentId).eq('customer_id', customerId).eq('company_id', tenant.companyId)
      if (updateError) {
        await storage.remove([objectPath])
        return back(request, customerId, 'documents', 'replace-failed')
      }
      const { error: oldFileCleanupError } = await storage.remove([oldDocument.storage_path])
      return back(request, customerId, 'documents', oldFileCleanupError ? 'replacement-cleanup-pending' : 'document-replaced')
    }

    const { error: uploadError } = await storage.upload(objectPath, file, { contentType: validated.mimeType, upsert: false })
    if (uploadError) return back(request, customerId, tab, 'storage-unavailable')
    const currentUser = (await supabase.auth.getUser()).data.user
    const userId = currentUser?.id ?? null
    if (intent === 'upload_document') {
      const category = String(form.get('category') ?? '')
      const name = String(form.get('name') ?? '').trim()
      const description = String(form.get('description') ?? '').trim() || null
      if (!DOCUMENT_CATEGORIES.includes(category as typeof DOCUMENT_CATEGORIES[number]) || name.length < 2) {
        await storage.remove([objectPath])
        return back(request, customerId, 'documents', 'metadata-invalid')
      }
      const { error } = await supabase.from('customer_documents').insert({
        company_id: tenant.companyId, customer_id: customerId, name, category, description, original_file_name: safeOriginalName(file.name),
        storage_path: objectPath, mime_type: validated.mimeType, file_size: file.size, uploaded_by: userId,
        uploaded_by_email: currentUser?.email ?? null, updated_by: userId, updated_by_email: currentUser?.email ?? null,
      })
      if (error) { await storage.remove([objectPath]); return back(request, customerId, 'documents', 'metadata-save-failed') }
      return back(request, customerId, 'documents', 'document-uploaded')
    }

    const contractNumber = String(form.get('contract_number') ?? '').trim()
    const title = String(form.get('title') ?? '').trim()
    const contractType = String(form.get('contract_type') ?? '').trim()
    const status = String(form.get('status') ?? 'draft')
    const sellerId = String(form.get('seller_id') ?? '') || null
    const signedAt = String(form.get('signed_at') ?? '') || null
    const effectiveFrom = String(form.get('effective_from') ?? '') || null
    const effectiveUntil = String(form.get('effective_until') ?? '') || null
    const amountText = String(form.get('contract_value') ?? '').trim()
    const amount = amountText ? Number(amountText.replace(',', '.')) : null
    const datesValid = [signedAt, effectiveFrom, effectiveUntil].every(validDate) && (!effectiveFrom || !effectiveUntil || effectiveUntil >= effectiveFrom)
    const { data: seller } = sellerId ? await supabase.from('sellers').select('id').eq('id', sellerId).eq('company_id', tenant.companyId).eq('active', true).maybeSingle() : { data: null }
    if (contractNumber.length < 1 || title.length < 2 || contractType.length < 2 || !contractStatuses.includes(status) || (sellerId && (!isUuid(sellerId) || !seller)) || !datesValid || (amount !== null && (!Number.isFinite(amount) || amount < 0))) {
      await storage.remove([objectPath])
      return back(request, customerId, 'contracts', 'metadata-invalid')
    }
    const contract = {
      company_id: tenant.companyId, customer_id: customerId, contract_number: contractNumber, title, contract_type: contractType,
      description: String(form.get('description') ?? '').trim() || null, status, seller_id: sellerId,
      signed_at: signedAt, effective_from: effectiveFrom, effective_until: effectiveUntil,
      contract_value: amount, original_file_name: safeOriginalName(file.name), storage_path: objectPath,
      mime_type: validated.mimeType, file_size: file.size, created_by: userId, created_by_email: currentUser?.email ?? null,
    }
    const { error } = await supabase.from('customer_contracts').insert(contract)
    if (error) { await storage.remove([objectPath]); return back(request, customerId, 'contracts', error.code === '23505' ? 'contract-number-exists' : 'contract-save-failed') }
    return back(request, customerId, 'contracts', 'contract-created')
  }

  if (intent === 'delete_document') {
    const documentId = String(form.get('document_id') ?? '')
    if (!uuidLike(documentId)) return back(request, customerId, 'documents', 'document-not-found')
    const { data: doc, error } = await supabase.from('customer_documents').select('id,storage_path').eq('id', documentId).eq('customer_id', customerId).eq('company_id', tenant.companyId).is('deleted_at', null).maybeSingle()
    if (error || !doc) return back(request, customerId, 'documents', 'document-not-found')
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null
    const { error: markError } = await supabase.from('customer_documents').update({ deleted_at: new Date().toISOString(), deleted_by: userId }).eq('id', documentId).eq('customer_id', customerId).eq('company_id', tenant.companyId)
    if (markError) return back(request, customerId, 'documents', 'delete-failed')
    const { error: storageError } = await storage.remove([doc.storage_path])
    if (storageError) {
      await supabase.from('customer_documents').update({ deleted_at: null, deleted_by: null }).eq('id', documentId).eq('customer_id', customerId).eq('company_id', tenant.companyId)
      return back(request, customerId, 'documents', 'storage-delete-failed')
    }
    return back(request, customerId, 'documents', 'document-deleted')
  }

  if (intent === 'change_contract_status') {
    const contractId = String(form.get('contract_id') ?? '')
    const status = String(form.get('status') ?? '')
    if (!uuidLike(contractId) || !contractStatuses.includes(status)) return back(request, customerId, 'contracts', 'metadata-invalid')
    const { error } = await supabase.from('customer_contracts').update({ status, updated_at: new Date().toISOString() }).eq('id', contractId).eq('customer_id', customerId).eq('company_id', tenant.companyId)
    if (error) return back(request, customerId, 'contracts', 'contract-status-failed')
    return back(request, customerId, 'contracts', 'contract-status-updated')
  }

  return back(request, customerId, tab, 'invalid-operation')
}
