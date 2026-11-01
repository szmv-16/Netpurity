const UA = 'NetPurity/0.1 (+https://github.com/netpurity)'

export async function getJson<T>(url: string, timeoutMs = 7000): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': UA, accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

export async function getText(url: string, timeoutMs = 7000): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': UA }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.text()).trim()
}

/** 并发执行并给每一项加上超时与错误隔离，永不整体失败 */
export async function settle<T>(
  tasks: { key: string; run: () => Promise<T> }[]
): Promise<{ key: string; value?: T; error?: string; ms: number }[]> {
  return Promise.all(
    tasks.map(async (t) => {
      const started = Date.now()
      try {
        const value = await t.run()
        return { key: t.key, value, ms: Date.now() - started }
      } catch (err) {
        return {
          key: t.key,
          error: err instanceof Error ? err.message : String(err),
          ms: Date.now() - started
        }
      }
    })
  )
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
