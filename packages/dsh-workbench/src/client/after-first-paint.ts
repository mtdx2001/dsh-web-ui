/** Defer optional runtime and geometry work until the shell has painted twice. */
export function afterFirstPaint(task: () => void): () => void {
  const usesRaf = typeof requestAnimationFrame === 'function'
  let cancelled = false
  let first: number | undefined
  let second: number | undefined
  const frame = (callback: FrameRequestCallback): number => usesRaf
    ? requestAnimationFrame(callback)
    : window.setTimeout(() => callback(performance.now()), 0)
  const cancel = (handle: number | undefined): void => {
    if (handle === undefined) return
    if (usesRaf) cancelAnimationFrame(handle)
    else window.clearTimeout(handle)
  }
  first = frame(() => {
    second = frame(() => { if (!cancelled) task() })
  })
  return () => {
    cancelled = true
    cancel(first)
    cancel(second)
  }
}
