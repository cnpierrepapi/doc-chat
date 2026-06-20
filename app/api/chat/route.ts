import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { embedQuery } from '@/lib/embed'
import { searchChunks } from '@/lib/store'

export const runtime = 'nodejs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const { question, documentId, history } = await req.json()

  if (!question?.trim() || !documentId) {
    return Response.json({ error: 'question and documentId required' }, { status: 400 })
  }

  // Embed question and retrieve relevant chunks
  const queryEmbedding = await embedQuery(question)
  const chunks = await searchChunks(queryEmbedding, documentId, 5)

  if (chunks.length === 0) {
    return Response.json({ error: 'No relevant content found' }, { status: 404 })
  }

  const context = chunks
    .map((c, i) => `[Source ${i + 1}] (chunk ${c.chunk_index})\n${c.content}`)
    .join('\n\n---\n\n')

  const systemPrompt = `You are a document assistant. Answer questions using ONLY the provided source excerpts.

Rules:
- Cite sources by number [1], [2] etc. when referencing specific content
- If the answer isn't in the sources, say so — don't invent
- Be concise and direct
- Quote brief key phrases when helpful

Sources:
${context}`

  // Build message history for multi-turn
  const messages: Anthropic.MessageParam[] = [
    ...(history ?? []),
    { role: 'user', content: question },
  ]

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      // First send the source chunks so the UI can render citations
      controller.enqueue(
        encoder.encode(JSON.stringify({ type: 'sources', chunks }) + '\n')
      )

      const response = await anthropic.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      })

      for await (const chunk of response) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: 'delta', text: chunk.delta.text }) + '\n')
          )
        }
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  })
}
