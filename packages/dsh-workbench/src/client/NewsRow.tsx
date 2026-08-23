import { useEffect, useRef, useState, type JSX } from 'react'
import { listNewsSources, loadNewsSource, type NewsItem, type NewsSource } from './news-feed.ts'
import { t } from './locales.ts'
import styles from './sidebar-rows.module.css'

export interface NewsRowApi {
  readonly list: typeof listNewsSources
  readonly load: typeof loadNewsSource
}

const DEFAULT_API: NewsRowApi = { list: listNewsSources, load: loadNewsSource }

/** Trusted Host-configured news sources rendered inside the bounded top sidebar row. */
export function NewsRow({ api = DEFAULT_API }: { api?: NewsRowApi }): JSX.Element {
  const [sources, setSources] = useState<NewsSource[]>([])
  const [sourceId, setSourceId] = useState('')
  const [items, setItems] = useState<NewsItem[]>([])
  const [status, setStatus] = useState<'loading' | 'empty' | 'ready' | 'error'>('loading')
  const abortRef = useRef<AbortController>()

  useEffect(() => {
    const abort = new AbortController()
    abortRef.current = abort
    void api.list(abort.signal).then(async (nextSources) => {
      if (abort.signal.aborted) return
      setSources(nextSources)
      if (nextSources.length === 0) { setStatus('empty'); return }
      const first = nextSources[0]!.id
      setSourceId(first)
      const nextItems = await api.load(first, abort.signal)
      if (abort.signal.aborted) return
      setItems(nextItems)
      setStatus('ready')
    }).catch(() => { if (!abort.signal.aborted) setStatus('error') })
    return () => abort.abort()
  }, [api])

  const changeSource = (nextId: string): void => {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    setSourceId(nextId)
    setItems([])
    setStatus('loading')
    void api.load(nextId, abort.signal).then((nextItems) => {
      if (abort.signal.aborted) return
      setItems(nextItems)
      setStatus('ready')
    }).catch(() => { if (!abort.signal.aborted) setStatus('error') })
  }

  if (status === 'empty') return <div className={styles.detailRow} role="status">{t('navigation.news.empty')}</div>
  if (status === 'error' && sources.length === 0) return <div className={styles.detailRow} role="alert">{t('navigation.news.error')}</div>
  return <div className={styles.knowledge}>
    {sources.length > 1 && <label className={styles.newsSource}>
      <span>{t('navigation.news.source')}</span>
      <select className={styles.searchInput} value={sourceId} onChange={(event) => changeSource(event.currentTarget.value)}>
        {sources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
      </select>
    </label>}
    {status === 'loading' && <div className={styles.detailRow}>{t('navigation.news.loading')}</div>}
    {status === 'error' && <div className={styles.detailRow} role="alert">{t('navigation.news.error')}</div>}
    {status === 'ready' && items.length === 0 && <div className={styles.detailRow}>{t('navigation.news.noItems')}</div>}
    {items.slice(0, 5).map((item, index) => item.link === undefined
      ? <div className={styles.newsItem} key={`${index}-${item.title}`}><strong>{item.title}</strong>{item.summary && <span>{item.summary}</span>}</div>
      : <a className={styles.newsItem} key={`${index}-${item.title}`} href={item.link} target="_blank" rel="noreferrer"><strong>{item.title}</strong>{item.summary && <span>{item.summary}</span>}</a>)}
  </div>
}
