import XLSX from 'xlsx-js-style'
import PDFDocument from 'pdfkit'
import type { CustomerExportFilters, CustomerExportRecord } from '@/lib/customer-export-types'

export type { CustomerExportFilters, CustomerExportRecord } from '@/lib/customer-export-types'

export const CUSTOMER_EXPORT_COLUMNS = [
  'Nome / Razão social',
  'Nome fantasia',
  'CPF/CNPJ',
  'Telefone',
  'WhatsApp',
  'E-mail',
  'Situação',
  'Produtos contratados',
  'Mensalidade total do cliente',
  'Dia de vencimento',
] as const

export function validateSelectedCustomerIds(ids: unknown): ids is string[] {
  return Array.isArray(ids)
    && ids.length > 0
    && ids.length <= 50000
    && ids.every(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    && new Set(ids).size === ids.length
}

export function customerExportFilterSummary(filters: CustomerExportFilters) {
  const status = filters.status === 'active' ? 'Ativos' : filters.status === 'inactive' ? 'Inativos' : 'Todos'
  const product = filters.productLabel || 'Todos os produtos'
  const search = filters.searchTerm || 'Sem pesquisa textual'
  const scope = filters.scope === 'selected' ? 'Somente clientes selecionados' : 'Todos os clientes encontrados pelos filtros'
  return `Pesquisa: ${search} | Situação: ${status} | Produto contratado: ${product} | Escopo: ${scope}`
}

function safeSpreadsheetText(value: string | null | undefined) {
  const text = (value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  return /^[\s]*[=+@-]/.test(text) ? `'${text}` : text
}

function customerStatusLabel(status: string) {
  return status === 'active' ? 'Ativo' : status === 'inactive' ? 'Inativo' : status
}

function currency(value: number | null) {
  return value == null
    ? ''
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function buildCustomerWorkbook(records: CustomerExportRecord[], filters: CustomerExportFilters, generatedAt = new Date()) {
  const rows: (string | number)[][] = [
    ['Relatório de Clientes — Nexo CRM'],
    ['Data de geração', generatedAt.toLocaleString('pt-BR')],
    ['Filtros utilizados', safeSpreadsheetText(customerExportFilterSummary(filters))],
    ['Total de clientes exportados', records.length],
    [],
    [...CUSTOMER_EXPORT_COLUMNS],
    ...records.map(record => [
      safeSpreadsheetText(record.name),
      safeSpreadsheetText(record.tradeName),
      safeSpreadsheetText(record.taxId),
      safeSpreadsheetText(record.phone),
      safeSpreadsheetText(record.whatsapp),
      safeSpreadsheetText(record.email),
      safeSpreadsheetText(customerStatusLabel(record.status)),
      safeSpreadsheetText(record.products.join(', ')),
      record.monthlyFee == null ? '' : record.monthlyFee,
      record.billingDay == null ? '' : record.billingDay,
    ]),
  ]
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = [
    { wch: 30 }, { wch: 26 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
    { wch: 32 }, { wch: 14 }, { wch: 48 }, { wch: 25 }, { wch: 18 },
  ]
  sheet['!autofilter'] = { ref: `A6:J${Math.max(6, records.length + 6)}` }
  sheet['!freeze'] = { xSplit: 0, ySplit: 6, topLeftCell: 'A7', activePane: 'bottomLeft', state: 'frozen' }

  const title = sheet.A1
  if (title) title.s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 16 }, fill: { fgColor: { rgb: '123047' } }, alignment: { vertical: 'center' } }
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }]
  for (const address of ['A2', 'A3', 'A4']) {
    if (sheet[address]) sheet[address].s = { font: { bold: true, color: { rgb: '123047' } } }
  }
  for (let column = 0; column < CUSTOMER_EXPORT_COLUMNS.length; column++) {
    const address = XLSX.utils.encode_cell({ r: 5, c: column })
    if (sheet[address]) sheet[address].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '245C73' } },
      alignment: { vertical: 'center', wrapText: true },
      border: { bottom: { style: 'medium', color: { rgb: '16394D' } } },
    }
  }
  for (let index = 0; index < records.length; index++) {
    const row = index + 6
    const taxIdCell = sheet[XLSX.utils.encode_cell({ r: row, c: 2 })]
    if (taxIdCell) taxIdCell.z = '@'
    const feeCell = sheet[XLSX.utils.encode_cell({ r: row, c: 8 })]
    if (feeCell) feeCell.z = '[$R$-pt-BR] #,##0.00;[Red]-[$R$-pt-BR] #,##0.00'
    const dueCell = sheet[XLSX.utils.encode_cell({ r: row, c: 9 })]
    if (dueCell) dueCell.z = '0'
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Clientes')
  workbook.Props = { Title: 'Relatório de Clientes — Nexo CRM', Subject: customerExportFilterSummary(filters), Author: 'Nexo CRM' }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true }) as Buffer
}

const PDF_COLUMNS = [
  { title: 'Nome / Razão social', width: 102 },
  { title: 'Nome fantasia', width: 80 },
  { title: 'CPF/CNPJ', width: 62 },
  { title: 'Telefone', width: 67 },
  { title: 'WhatsApp', width: 67 },
  { title: 'E-mail', width: 98 },
  { title: 'Situação', width: 45 },
  { title: 'Produtos contratados', width: 130 },
  { title: 'Mensalidade total', width: 85 },
  { title: 'Dia venc.', width: 58 },
] as const
const PDF_MARGIN = 24
const PDF_FONT_SIZE = 6.4
const PDF_LINE_HEIGHT = 8
const PDF_TABLE_WIDTH = PDF_COLUMNS.reduce((sum, column) => sum + column.width, 0)

function wrapPdfCell(document: PDFKit.PDFDocument, value: string, width: number) {
  const lines: string[] = []
  for (const paragraph of value.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      if (!line) {
        if (document.widthOfString(word, { width }) <= width) line = word
        else {
          let part = ''
          for (const character of word) {
            if (part && document.widthOfString(part + character) > width) {
              lines.push(part)
              part = character
            } else part += character
          }
          line = part
        }
      } else if (document.widthOfString(`${line} ${word}`) <= width) line += ` ${word}`
      else {
        lines.push(line)
        if (document.widthOfString(word) <= width) line = word
        else {
          let part = ''
          for (const character of word) {
            if (part && document.widthOfString(part + character) > width) {
              lines.push(part)
              part = character
            } else part += character
          }
          line = part
        }
      }
    }
    lines.push(line)
  }
  return lines.length ? lines : ['']
}

export function buildCustomerPdf(records: CustomerExportRecord[], filters: CustomerExportFilters, generatedAt = new Date()) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: PDF_MARGIN, bufferPages: true, compress: true })
    const chunks: Buffer[] = []
    document.on('data', chunk => chunks.push(Buffer.from(chunk)))
    document.on('error', reject)
    document.on('end', () => resolve(Buffer.concat(chunks)))
      document.info.Title = 'Relatório de Clientes — Nexo CRM'
    document.info.Author = 'Nexo CRM'

    const bottom = document.page.height - PDF_MARGIN - 22
    let y = 0
    const drawPageHeader = () => {
      document.font('Helvetica-Bold').fontSize(13).fillColor('#123047')
        .text('Relatório de Clientes — Nexo CRM', PDF_MARGIN, PDF_MARGIN, { width: PDF_TABLE_WIDTH })
      document.font('Helvetica').fontSize(7).fillColor('#334155')
      document.text(`Emissão: ${generatedAt.toLocaleString('pt-BR')} | Clientes: ${records.length}`, PDF_MARGIN, PDF_MARGIN + 19, { width: PDF_TABLE_WIDTH })
      document.text(`Filtros: ${customerExportFilterSummary(filters)}`, PDF_MARGIN, PDF_MARGIN + 30, { width: PDF_TABLE_WIDTH, height: 24, ellipsis: true })
      y = PDF_MARGIN + 62
      drawTableHeader()
    }
    const drawTableHeader = () => {
      document.rect(PDF_MARGIN, y, PDF_TABLE_WIDTH, 22).fill('#245C73')
      let x = PDF_MARGIN
      document.font('Helvetica-Bold').fontSize(6.4).fillColor('#FFFFFF')
      for (const column of PDF_COLUMNS) {
        document.text(column.title, x + 3, y + 5, { width: column.width - 6, height: 14, ellipsis: true })
        x += column.width
      }
      y += 22
    }
    const nextPage = () => {
      document.addPage({ size: 'A4', layout: 'landscape', margin: PDF_MARGIN })
      drawPageHeader()
    }

    drawPageHeader()
    document.font('Helvetica').fontSize(PDF_FONT_SIZE)
    records.forEach((record, index) => {
      document.font('Helvetica').fontSize(PDF_FONT_SIZE)
      const values = [
        record.name,
        record.tradeName ?? '',
        record.taxId ?? '',
        record.phone ?? '',
        record.whatsapp ?? '',
        record.email ?? '',
        customerStatusLabel(record.status),
        record.products.join(', '),
        currency(record.monthlyFee),
        record.billingDay == null ? '' : String(record.billingDay),
      ]
      const wrapped = values.map((value, column) => wrapPdfCell(document, value, PDF_COLUMNS[column].width - 7))
      const maxLines = Math.max(1, ...wrapped.map(lines => lines.length))
      const maxLinesPerPage = Math.max(1, Math.floor((bottom - (PDF_MARGIN + 84) - 10) / PDF_LINE_HEIGHT))
      for (let offset = 0; offset < maxLines; offset += maxLinesPerPage) {
        const segmentLines = Math.min(maxLinesPerPage, maxLines - offset)
        const rowHeight = Math.max(18, segmentLines * PDF_LINE_HEIGHT + 6)
        if (y + rowHeight > bottom) nextPage()
        if (index % 2 === 1) document.rect(PDF_MARGIN, y, PDF_TABLE_WIDTH, rowHeight).fill('#F1F5F9')
        document.strokeColor('#CBD5E1').lineWidth(0.3).moveTo(PDF_MARGIN, y + rowHeight).lineTo(PDF_MARGIN + PDF_TABLE_WIDTH, y + rowHeight).stroke()
        let x = PDF_MARGIN
        document.font('Helvetica').fontSize(PDF_FONT_SIZE).fillColor('#172B3A')
        for (let column = 0; column < PDF_COLUMNS.length; column++) {
          const text = wrapped[column].slice(offset, offset + segmentLines).join('\n')
          document.text(text, x + 3, y + 3, { width: PDF_COLUMNS[column].width - 7, lineBreak: false, lineGap: 0 })
          x += PDF_COLUMNS[column].width
        }
        y += rowHeight
      }
    })

    const pages = document.bufferedPageRange()
    for (let index = pages.start; index < pages.start + pages.count; index++) {
      document.switchToPage(index)
      document.font('Helvetica').fontSize(7).fillColor('#64748B')
        .text(`Página ${index + 1} de ${pages.count}`, PDF_MARGIN, document.page.height - PDF_MARGIN - 9, { width: PDF_TABLE_WIDTH, align: 'right' })
    }
    document.end()
  })
}
