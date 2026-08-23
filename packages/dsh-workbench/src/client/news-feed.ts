export interface NewsSource {
  id: string
  label: string
}

export interface NewsItem {
  title: string
  summary: string
  link?: string
  published?: string
}

interface Envelope<T> {
  ok: boolean
  value?: T
}

function textOf(element: Element, selectors: string): string {
  const value = element.querySelector(selectors)?.textContent?.trim() ?? ''
  return value.slice(0, 500)
}

function safeLink(value: string): string | undefined {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined
  } catch {
    return undefined
  }
}

function summaryText(value: string): string {
  const parsed = new DOMParser().parseFromString(`<body>${value}</body>`, 'text/html')
  return (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 700)
}

export function parseNewsFeed(content: string): NewsItem[] {
  const document = new DOMParser().parseFromString(content, 'application/xml')
  if (document.querySelector('parsererror') !== null) throw new Error('invalid-feed')
  const entries = [...document.querySelectorAll('item, entry')].slice(0, 50)
  return entries.flatMap((entry) => {
    const title = textOf(entry, 'title')
    if (title === '') return []
    const rawLink = entry.matches('entry')
      ? entry.querySelector('link[href]')?.getAttribute('href') ?? textOf(entry, 'link')
      : textOf(entry, 'link')
    const rawSummary = textOf(entry, 'description, summary, content')
    return [{
      title,
      summary: summaryText(rawSummary),
      link: safeLink(rawLink),
      published: textOf(entry, 'pubDate, published, updated') || undefined,
    }]
  })
}

export async function listNewsSources(signal: AbortSignal): Promise<NewsSource[]> {
  const response = await fetch('/dsh-workbench/news/sources', { signal, headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error('sources-unavailable')
  const envelope = await response.json() as Envelope<NewsSource[]>
  if (!envelope.ok || !Array.isArray(envelope.value)) throw new Error('sources-invalid')
  return envelope.value.filter((source) => typeof source.id === 'string' && typeof source.label === 'string')
}

export async function loadNewsSource(id: string, signal: AbortSignal): Promise<NewsItem[]> {
  const response = await fetch(`/dsh-workbench/news?source=${encodeURIComponent(id)}`, { signal, headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error('source-unavailable')
  const envelope = await response.json() as Envelope<{ content?: unknown }>
  if (!envelope.ok || typeof envelope.value?.content !== 'string') throw new Error('source-invalid')
  return parseNewsFeed(envelope.value.content)
}
