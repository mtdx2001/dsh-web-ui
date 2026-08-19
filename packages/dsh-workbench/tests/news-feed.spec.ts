import { describe, expect, it } from 'vitest'
import { isPublicIpv4, resolveNewsSources } from '../src/host/news.ts'
import { parseNewsFeed } from '../src/client/news-feed.ts'

describe('trusted News source validation', () => {
  it('accepts only unique HTTPS source ids without credentials or custom ports', () => {
    expect(resolveNewsSources([{ id: 'main-feed', label: 'Main', url: 'https://example.com/feed.xml' }])[0].target.hostname).toBe('example.com')
    expect(() => resolveNewsSources([{ id: 'bad_id', label: 'Bad', url: 'https://example.com' }])).toThrow()
    expect(() => resolveNewsSources([{ id: 'plain', label: 'Plain', url: 'http://example.com' }])).toThrow()
    expect(() => resolveNewsSources([{ id: 'port', label: 'Port', url: 'https://example.com:8443' }])).toThrow()
    expect(() => resolveNewsSources([{ id: 'credentials', label: 'Credentials', url: 'https://user:pass@example.com' }])).toThrow()
    expect(() => resolveNewsSources([
      { id: 'same', label: 'One', url: 'https://example.com' },
      { id: 'same', label: 'Two', url: 'https://example.org' },
    ])).toThrow()
  })

  it('rejects private, loopback, link-local, reserved, and multicast IPv4 targets', () => {
    for (const address of ['0.0.0.0', '10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.0.0.1']) {
      expect(isPublicIpv4(address), address).toBe(false)
    }
    expect(isPublicIpv4('8.8.8.8')).toBe(true)
  })
})

describe('RSS and Atom parsing', () => {
  it('parses RSS and strips markup and unsafe links', () => {
    const entries = parseNewsFeed(`<?xml version="1.0"?><rss><channel><item><title>Release</title><description><![CDATA[<b>Ship</b> <i>now</i>]]></description><link>https://example.com/release</link><pubDate>Today</pubDate></item><item><title>Unsafe</title><description>text</description><link>javascript:alert(1)</link></item></channel></rss>`)
    expect(entries).toEqual([
      { title: 'Release', summary: 'Ship now', link: 'https://example.com/release', published: 'Today' },
      { title: 'Unsafe', summary: 'text', link: undefined, published: undefined },
    ])
  })

  it('parses Atom links, caps rows, and rejects malformed XML', () => {
    const items = Array.from({ length: 55 }, (_, index) => `<entry><title>Entry ${index}</title><link href="https://example.com/${index}"/><summary>Summary ${index}</summary></entry>`).join('')
    expect(parseNewsFeed(`<feed>${items}</feed>`)).toHaveLength(50)
    expect(parseNewsFeed('<feed><entry><title>Atom</title><link href="https://example.com/a"/><summary>Summary</summary></entry></feed>')[0]).toMatchObject({ title: 'Atom', summary: 'Summary', link: 'https://example.com/a' })
    expect(() => parseNewsFeed('<feed><entry>')).toThrow('invalid-feed')
  })
})
