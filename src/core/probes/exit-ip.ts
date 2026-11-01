import { settle } from '../http.ts'
import type { ExitIpInfo, IpSourceResult } from '../types.ts'

const isV4 = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s)
const isV6 = (s: string) => s.includes(':') && /^[0-9a-f:]+$/i.test(s)

/** 出口 IP 探测源。多源交叉验证，任何单一源被劫持都能被发现。 */
const SOURCES: { key: string; url: string; pick: (body: string) => string }[] = [
  { key: 'ipify', url: 'https://api.ipify.org?format=json', pick: (b) => JSON.parse(b).ip },
  { key: 'ipwho.is', url: 'https://ipwho.is/', pick: (b) => JSON.parse(b).ip },
  { key: 'icanhazip', url: 'https://icanhazip.com', pick: (b) => b.trim() },
  { key: 'ifconfig.me', url: 'https://ifconfig.me/ip', pick: (b) => b.trim() },
  { key: 'ipinfo', url: 'https://ipinfo.io/ip', pick: (b) => b.trim() },
  { key: 'ipv6.icanhazip', url: 'https://ipv6.icanhazip.com', pick: (b) => b.trim() },
  { key: 'v6.ident.me', url: 'https://v6.ident.me', pick: (b) => b.trim() }
]

function mode(values: string[]): string | undefined {
  if (!values.length) return undefined
  const tally = new Map<string, number>()
  for (const v of values) tally.set(v, (tally.get(v) ?? 0) + 1)
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

export async function probeExitIp(): Promise<ExitIpInfo> {
  const results = await settle(
    SOURCES.map((s) => ({
      key: s.key,
      run: async () => {
        const res = await fetch(s.url, {
          signal: AbortSignal.timeout(6000),
          headers: { 'user-agent': 'NetPurity/0.1', accept: '*/*' }
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = await res.text()
        const ip = s.pick(body)
        if (!ip) throw new Error('响应中没有 IP')
        return ip
      }
    }))
  )

  const sources: IpSourceResult[] = []
  for (const r of results) {
    const src = SOURCES.find((s) => s.key === r.key)!
    sources.push({ name: src.key, ip: r.value, ms: r.ms, error: r.error })
  }

  const v4 = sources.filter((s) => s.ip && isV4(s.ip)).map((s) => s.ip!)
  const v6 = sources.filter((s) => s.ip && isV6(s.ip)).map((s) => s.ip!)
  const uniqueV4 = new Set(v4)
  const uniqueV6 = new Set(v6)

  return {
    ipv4: mode(v4),
    ipv6: mode(v6),
    sources,
    // 至少两个源成功且结论一致，才算“一致”
    consistent: v4.length < 2 ? true : uniqueV4.size <= 1 && uniqueV6.size <= 1
  }
}
