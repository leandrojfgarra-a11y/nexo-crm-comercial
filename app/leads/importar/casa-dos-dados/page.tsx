import { CasaDadosProspecting } from '@/components/casa-dados-prospecting'
import { createTenantClient } from '@/lib/tenant/authorized-client'

export default async function CasaDosDadosProspectingPage() {
  await createTenantClient()
  return <CasaDadosProspecting />
}
