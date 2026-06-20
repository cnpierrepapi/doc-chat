import { NextRequest } from 'next/server'
import { extractText } from 'unpdf'
import { chunkText } from '@/lib/chunker'
import { embedTexts } from '@/lib/embed'
import { createDocument, saveChunks } from '@/lib/store'
import type { IngestEvent } from '@/lib/types'

export const runtime = 'nodejs'

function send(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: IngestEvent) {
  controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()
  const contentType = req.headers.get('content-type') ?? ''

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: IngestEvent) => send(controller, encoder, event)

      try {
        let rawText = ''
        let title = 'Untitled'
        let sourceType: 'pdf' | 'text' | 'url' = 'text'
        let sourceUrl: string | undefined

        if (contentType.includes('multipart/form-data')) {
          // PDF upload
          const form = await req.formData()
          const file = form.get('file') as File | null
          if (!file) throw new Error('No file uploaded')

          title = file.name.replace(/\.pdf$/i, '')
          sourceType = 'pdf'
          emit({ type: 'progress', message: 'Reading PDF…' })

          const buffer = await file.arrayBuffer()
          const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })
          rawText = text
        } else {
          const body = await req.json()

          if (body.url) {
            // URL scrape — native fetch (ported from warmlane/lib/seeding/website-fetcher.ts)
            sourceType = 'url'
            sourceUrl = body.url
            title = body.url.replace(/^https?:\/\//, '').split('/')[0]
            emit({ type: 'progress', message: 'Fetching URL…' })

            const fullUrl = (body.url as string).startsWith('http') ? body.url : `https://${body.url}`
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 15000)

            let fetchRes: Response
            try {
              fetchRes = await fetch(fullUrl, {
                signal: controller.signal,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; DocChat/1.0; +https://doc-chat-beige-beta.vercel.app)',
                  Accept: 'text/html',
                },
                redirect: 'follow',
              })
            } finally {
              clearTimeout(timer)
            }

            if (!fetchRes.ok) {
              if (fetchRes.status === 403 || fetchRes.status === 401)
                throw new Error('Site is blocking automated access (403/401)')
              throw new Error(`Could not fetch URL: HTTP ${fetchRes.status}`)
            }

            const html = await fetchRes.text()
            rawText = html
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<nav[\s\S]*?<\/nav>/gi, '')
              .replace(/<footer[\s\S]*?<\/footer>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/&[a-z]+;/gi, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 60000)
          } else if (body.text) {
            // Plain text paste
            sourceType = 'text'
            title = body.title?.trim() || 'Pasted text'
            rawText = body.text
          } else {
            throw new Error('Provide a file, url, or text field')
          }
        }

        if (!rawText.trim()) throw new Error('No text content found in source')

        emit({ type: 'progress', message: 'Splitting into chunks…' })
        const chunks = chunkText(rawText)
        emit({ type: 'progress', message: `Embedding ${chunks.length} chunks…` })

        // Embed in batches of 64 (Voyage rate limit)
        const BATCH = 64
        const embeddings: number[][] = []
        for (let i = 0; i < chunks.length; i += BATCH) {
          const batch = chunks.slice(i, i + BATCH)
          const batchEmbeddings = await embedTexts(batch)
          embeddings.push(...batchEmbeddings)
          if (chunks.length > BATCH) {
            emit({ type: 'progress', message: `Embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length} chunks…` })
          }
        }

        emit({ type: 'progress', message: 'Saving to database…' })
        const doc = await createDocument(title, sourceType, sourceUrl)
        await saveChunks(
          doc.id,
          chunks.map((content, i) => ({ content, chunk_index: i, embedding: embeddings[i] }))
        )

        emit({ type: 'done', document: doc })
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Ingest failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
