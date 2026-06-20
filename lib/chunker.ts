const CHUNK_SIZE = 1800   // chars (~450 tokens)
const CHUNK_OVERLAP = 200 // chars (~50 tokens)

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

  if (normalized.length <= CHUNK_SIZE) return [normalized]

  const chunks: string[] = []
  let start = 0

  while (start < normalized.length) {
    let end = start + CHUNK_SIZE

    if (end >= normalized.length) {
      chunks.push(normalized.slice(start).trim())
      break
    }

    // Prefer splitting on paragraph boundary
    let splitAt = normalized.lastIndexOf('\n\n', end)
    if (splitAt <= start) {
      // Fall back to sentence boundary
      splitAt = normalized.lastIndexOf('. ', end)
      if (splitAt <= start) {
        // Last resort: word boundary
        splitAt = normalized.lastIndexOf(' ', end)
        if (splitAt <= start) splitAt = end
      } else {
        splitAt += 1 // include the period
      }
    }

    const chunk = normalized.slice(start, splitAt).trim()
    if (chunk.length > 0) chunks.push(chunk)

    start = splitAt - CHUNK_OVERLAP
    if (start < 0) start = 0
  }

  return chunks.filter((c) => c.length > 50) // drop tiny fragments
}
