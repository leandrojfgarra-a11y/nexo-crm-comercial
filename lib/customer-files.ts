export const PRIVATE_CUSTOMER_BUCKET = 'nexo-crm-private'
export const MAX_CUSTOMER_FILE_SIZE = 10 * 1024 * 1024
export const DOCUMENT_CATEGORIES = ['personal', 'business', 'state_registration', 'address', 'certificates', 'other'] as const
export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number]

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  personal: 'Documentos pessoais (RG, CPF e CNH)',
  business: 'Documentos empresariais (CNPJ e contrato social)',
  state_registration: 'Inscrição Estadual e Municipal',
  address: 'Comprovantes de endereço',
  certificates: 'Certificados e documentos fiscais',
  other: 'Outros documentos',
}

const mimeByExtension: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function safeOriginalName(value: string) {
  return value.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'arquivo'
}

export async function validateCustomerFile(file: File, kind: 'document' | 'contract') {
  if (file.size <= 0 || file.size > MAX_CUSTOMER_FILE_SIZE) return { error: 'O arquivo deve ter entre 1 byte e 10 MB.' as const }
  const name = safeOriginalName(file.name)
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  const allowed = kind === 'document' ? ['pdf', 'jpg', 'jpeg', 'png', 'docx'] : ['pdf', 'docx']
  if (!allowed.includes(extension)) return { error: 'Formato não permitido para este tipo de arquivo.' as const }
  const expectedMime = mimeByExtension[extension]
  if (!expectedMime || file.type !== expectedMime) return { error: 'O tipo declarado do arquivo não corresponde à extensão.' as const }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte)
  let validSignature = false
  if (extension === 'pdf') validSignature = new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
  else if (extension === 'jpg' || extension === 'jpeg') validSignature = starts(0xff, 0xd8, 0xff)
  else if (extension === 'png') validSignature = starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  else if (extension === 'docx') {
    const header = starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06)
    const archiveText = new TextDecoder('windows-1252').decode(bytes)
    validSignature = header && archiveText.includes('[Content_Types].xml') && archiveText.includes('word/document.xml')
  }
  if (!validSignature) return { error: 'O conteúdo do arquivo não corresponde a um PDF, JPG, PNG ou DOCX válido.' as const }

  return { name, extension, mimeType: expectedMime, bytes }
}
