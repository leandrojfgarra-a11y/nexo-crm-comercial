import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

export const PEOPLE_LOOKUP_BATCH_SIZE = 100
const MAX_CONCURRENT_PEOPLE_LOOKUPS = 5

export function splitPeopleLookupIds(personIds: string[], batchSize = PEOPLE_LOOKUP_BATCH_SIZE) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError('O tamanho do lote precisa ser positivo.')
  const uniqueIds = [...new Set(personIds.filter(Boolean))]
  const batches: string[][] = []
  for (let start = 0; start < uniqueIds.length; start += batchSize) {
    batches.push(uniqueIds.slice(start, start + batchSize))
  }
  return batches
}

/**
 * Fetches person records in bounded PostgREST `in` filters, keeping every
 * request scoped to the authenticated tenant.
 */
export async function loadPeopleByIds(
  supabase: SupabaseClient,
  companyId: string,
  personIds: string[],
  columns: string,
): Promise<{ data: any[] | null; error: PostgrestError | null }> {
  const batches = splitPeopleLookupIds(personIds)
  const rows: any[] = []

  for (let start = 0; start < batches.length; start += MAX_CONCURRENT_PEOPLE_LOOKUPS) {
    const requests = await Promise.all(batches.slice(start, start + MAX_CONCURRENT_PEOPLE_LOOKUPS).map(ids =>
      supabase.from('people')
        .select(columns)
        .eq('company_id', companyId)
        .in('id', ids),
    ))
    const failedRequest = requests.find(request => request.error)
    if (failedRequest?.error) return { data: null, error: failedRequest.error }
    for (const request of requests) rows.push(...(request.data ?? []))
  }

  return { data: rows, error: null }
}
