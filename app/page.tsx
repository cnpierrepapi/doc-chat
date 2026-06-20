'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { Document, Chunk, ChatMessage, IngestEvent } from '@/lib/types'

// ─── Upload Panel ────────────────────────────────────────────────────────────

type UploadTab = 'pdf' | 'text' | 'url'

function UploadPanel({ onDocument }: { onDocument: (doc: Document) => void }) {
  const [tab, setTab] = useState<UploadTab>('pdf')
  const [progress, setProgress] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [textInput, setTextInput] = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const processStream = useCallback(
    async (res: Response) => {
      if (!res.ok || !res.body) throw new Error('Request failed')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as IngestEvent
          if (event.type === 'progress') setProgress((p) => [...p, event.message])
          else if (event.type === 'done') { setLoading(false); onDocument(event.document) }
          else if (event.type === 'error') throw new Error(event.message)
        }
      }
    },
    [onDocument]
  )

  const ingest = useCallback(
    async (fetchFn: () => Promise<Response>) => {
      setLoading(true)
      setProgress([])
      setError('')
      try {
        const res = await fetchFn()
        await processStream(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed')
        setLoading(false)
      }
    },
    [processStream]
  )

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.pdf')) { setError('Only PDF files are supported'); return }
    const form = new FormData()
    form.append('file', file)
    ingest(() => fetch('/api/ingest', { method: 'POST', body: form }))
  }

  const tabClass = (t: UploadTab) =>
    `px-4 py-2 text-xs font-medium rounded-md transition-colors ${
      tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
    }`

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Document Chat</h1>
        <p className="text-sm text-zinc-400 mt-1">Upload a document, then ask questions. Answers cite sources.</p>
      </div>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-6">
        <div className="flex gap-1 mb-6 bg-zinc-800/60 rounded-lg p-1 w-fit">
          <button onClick={() => setTab('pdf')} className={tabClass('pdf')}>PDF upload</button>
          <button onClick={() => setTab('text')} className={tabClass('text')}>Paste text</button>
          <button onClick={() => setTab('url')} className={tabClass('url')}>From URL</button>
        </div>

        {tab === 'pdf' && (
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
              dragging ? 'border-blue-400 bg-blue-400/5' : 'border-zinc-700 hover:border-zinc-500'
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragging(false)
              const file = e.dataTransfer.files[0]
              if (file) handleFile(file)
            }}
          >
            <p className="text-3xl mb-3">📄</p>
            <p className="text-sm text-zinc-300 font-medium">Drop a PDF here or click to browse</p>
            <p className="text-xs text-zinc-500 mt-1">Reports, contracts, manuals, research papers</p>
            <input
              ref={fileRef} type="file" accept=".pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>
        )}

        {tab === 'text' && (
          <div className="space-y-3">
            <input
              type="text" placeholder="Document title (optional)"
              value={textTitle} onChange={(e) => setTextTitle(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
            <textarea
              placeholder="Paste your text content here…"
              value={textInput} onChange={(e) => setTextInput(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none resize-none"
            />
            <button
              onClick={() => ingest(() => fetch('/api/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: textInput, title: textTitle }) }))}
              disabled={!textInput.trim() || loading}
              className="w-full rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 transition-colors disabled:opacity-40"
            >
              Process text →
            </button>
          </div>
        )}

        {tab === 'url' && (
          <div className="space-y-3">
            <input
              type="url" placeholder="https://example.com/page"
              value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
            <p className="text-xs text-zinc-500">Fetches and reads the page content as text.</p>
            <button
              onClick={() => ingest(() => fetch('/api/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: urlInput }) }))}
              disabled={!urlInput.trim() || loading}
              className="w-full rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 transition-colors disabled:opacity-40"
            >
              Fetch and process →
            </button>
          </div>
        )}
      </div>

      {(loading || progress.length > 0) && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-1.5">
          {progress.map((msg, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-emerald-400">✓</span>
              <span className="text-zinc-300">{msg}</span>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-zinc-400">Working…</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  )
}

// ─── Chat Panel ──────────────────────────────────────────────────────────────

function SourceCard({ chunk, index }: { chunk: Chunk; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      onClick={() => setOpen((o) => !o)}
      className="text-left w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 hover:border-zinc-500 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-blue-400">Source {index + 1}</span>
        <span className="text-xs text-zinc-500">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <p className="mt-2 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {chunk.content.slice(0, 600)}{chunk.content.length > 600 ? '…' : ''}
        </p>
      )}
    </button>
  )
}

function ChatPanel({ document: doc, onReset }: { document: Document; onReset: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const ask = async () => {
    const question = input.trim()
    if (!question || loading) return

    const userMsg: ChatMessage = { role: 'user', content: question }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setLoading(true)

    const apiHistory = messages.map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, documentId: doc.id, history: apiHistory }),
      })

      if (!res.ok || !res.body) throw new Error('Chat request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sources: Chunk[] = []
      let assistantText = ''

      setMessages((m) => [...m, { role: 'assistant', content: '', sources: [] }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line)
          if (event.type === 'sources') {
            sources = event.chunks
          } else if (event.type === 'delta') {
            assistantText += event.text
            setMessages((m) => {
              const updated = [...m]
              updated[updated.length - 1] = { role: 'assistant', content: assistantText, sources }
              return updated
            })
          }
        }
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">{doc.source_type}</p>
          <h2 className="text-base font-semibold text-white">{doc.title}</h2>
          <p className="text-xs text-zinc-500">{doc.chunk_count} chunks indexed</p>
        </div>
        <button onClick={onReset} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← New document
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 min-h-0 pr-1">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm">Ask anything about this document.</p>
            <p className="text-zinc-600 text-xs mt-1">Answers will cite source passages.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'flex justify-end' : ''}>
            {msg.role === 'user' ? (
              <div className="max-w-xs rounded-2xl bg-zinc-700 px-4 py-2.5 text-sm text-white">
                {msg.content}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                  {loading && i === messages.length - 1 && (
                    <span className="inline-block w-1 h-4 bg-zinc-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </div>
                {(msg.sources ?? []).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-zinc-500">Sources</p>
                    {(msg.sources ?? []).map((chunk, ci) => (
                      <SourceCard key={chunk.id} chunk={chunk} index={ci} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-800">
        <div className="flex gap-2">
          <input
            type="text" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
            placeholder="Ask a question about this document…"
            disabled={loading}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={ask} disabled={!input.trim() || loading}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 transition-colors disabled:opacity-40"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function Home() {
  const [doc, setDoc] = useState<Document | null>(null)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-12 flex flex-col" style={{ minHeight: '100vh' }}>
        <div className="mb-8">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Onenept</span>
        </div>
        {!doc ? (
          <UploadPanel onDocument={setDoc} />
        ) : (
          <div className="flex-1 flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
            <ChatPanel document={doc} onReset={() => setDoc(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
