import VoyageAI from 'voyageai'

const MODEL = 'voyage-3'

function client() {
  return new VoyageAI({ apiKey: process.env.VOYAGE_API_KEY! })
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const voyage = client()
  const response = await voyage.embed({
    model: MODEL,
    input: texts,
    inputType: 'document',
  })
  return response.data.map((d: { embedding: number[] }) => d.embedding)
}

export async function embedQuery(query: string): Promise<number[]> {
  const voyage = client()
  const response = await voyage.embed({
    model: MODEL,
    input: [query],
    inputType: 'query',
  })
  return response.data[0].embedding
}
