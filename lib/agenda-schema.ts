import type { SupabaseClient } from '@supabase/supabase-js'

export async function hasAgendaSchema(supabase: SupabaseClient) {
  const { error } = await supabase
    .from('agenda_events')
    .select(
      'id,title,description,event_type,starts_at,ends_at,all_day,contact_id,contact_name_manual,contact_phone_manual,service_id,service_name_manual,service_description_manual,assigned_user_id,status,color,company_id,created_at,updated_at'
    )
    .limit(0)
  return !error
}
