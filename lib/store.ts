import { createClient } from '@supabase/supabase-js'
import type { Document, Chunk } from './types'

function client() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  )
}

export async function createDocument(
  title: string,
  sourceType: 'pdf' | 'text' | 'url',
  sourceUrl?: string
): Promise<Document> {
  const { data, error } = await client()
    .from('documents')
    .insert({ title, source_type: sourceType, source_url: sourceUrl ?? null })
    .select()
    .single()
  if (error) throw new Error(`Failed to create document: ${error.message}`)
  return data as Document
}

export async function saveChunks(
  documentId: string,
  chunks: { content: string; chunk_index: number; embedding: number[] }[]
): Promise<void> {
  const rows = chunks.map((c) => ({
    document_id: documentId,
    content: c.content,
    chunk_index: c.chunk_index,
    embedding: JSON.stringify(c.embedding),
  }))

  const { error } = await client().from('document_chunks').insert(rows)
  if (error) throw new Error(`Failed to save chunks: ${error.message}`)

  await client()
    .from('documents')
    .update({ chunk_count: chunks.length })
    .eq('id', documentId)
}

export async function searchChunks(
  queryEmbedding: number[],
  documentId: string,
  matchCount = 5
): Promise<Chunk[]> {
  const { data, error } = await client().rpc('match_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: matchCount,
    filter_doc_id: documentId,
  })
  if (error) throw new Error(`Search failed: ${error.message}`)
  return (data ?? []) as Chunk[]
}

export async function listDocuments(): Promise<Document[]> {
  const { data } = await client()
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  return (data ?? []) as Document[]
}
