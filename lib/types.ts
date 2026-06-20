export type SourceType = 'pdf' | 'text' | 'url'

export type Document = {
  id: string
  title: string
  source_type: SourceType
  source_url: string | null
  chunk_count: number
  created_at: string
}

export type Chunk = {
  id: string
  document_id: string
  content: string
  chunk_index: number
  similarity?: number
}

export type IngestEvent =
  | { type: 'progress'; message: string }
  | { type: 'done'; document: Document }
  | { type: 'error'; message: string }

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  sources?: Chunk[]
}
