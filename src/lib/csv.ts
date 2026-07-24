export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => {
    const s = value === null || value === undefined ? '' : String(value)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = toCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Parses CSV files exported by this app, including quoted commas and newlines. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [[]]
  let value = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted && char === '"' && text[i + 1] === '"') {
      value += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (!quoted && char === ',') {
      rows[rows.length - 1].push(value)
      value = ''
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      rows[rows.length - 1].push(value)
      value = ''
      rows.push([])
    } else {
      value += char
    }
  }
  rows[rows.length - 1].push(value)
  const [headers, ...data] = rows.filter((row) => row.some((cell) => cell.trim() !== ''))
  if (!headers || headers.length === 0) return []
  return data.map((row) => Object.fromEntries(headers.map((header, index) => [header.trim(), row[index] ?? ''])))
}
