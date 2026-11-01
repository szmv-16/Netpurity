import { promises as dns } from 'node:dns'
import { Resolver } from 'node:dns/promises'
import { getJson } from '../http.ts'
import { isPublicDns } from '../data/ip-class.ts'
import { lookupOrg } from './ip-intel.ts'
import type { CheckResult, Finding, IpIntel, ResolverObservation } from '../types.ts'
import { WEIGHTS } from '../weights.ts'

const IPV4_RE = /(\d{1,3}(?:\.\d{1,3}){3})/

function systemResolver(): Resolver {
  const r = new Resolver({ timeout: 6000, tries: 1 })
  const servers = dns.getServers()
  if (servers.length) r.setServers(servers)
  return r
}

interface EchoAttempt {
  via: string
  ip?: string
  error?: string
}

/**
 * 解析器出口 IP 观测。
 * 原理：某些权威 DNS 会把「递归解析器的出口地址」回显在应答里。
 * 这是在没有自建权威服务器的前提下，最接近真实 DNS 泄露检测的办法。
 */
async function observeResolvers(): Promise<{ observations: ResolverObservation[]; attempts: EchoAttempt[] }> {
  const seen = new Map<string, ResolverObservation>()
  const attempts: EchoAttempt[] = []
  const r = systemResolver()

  const add = (ip: string, via: string) => {
    if (!seen.has(ip)) seen.set(ip, { ip, via, isPublicDns: isPublicDns(ip) })
  }

  const tasks: Promise<void>[] = [
    (async () => {
      const via = 'Google o-o.myaddr'
      try {
        const txt = await r.resolveTxt('o-o.myaddr.l.google.com')
        const flat = txt.map((rec) => rec.join('')).join(' ')
        const m = flat.match(IPV4_RE)
        if (m) {
          add(m[1], via)
          attempts.push({ via, ip: m[1] })
        } else {
          attempts.push({ via, error: `应答中没有地址：${flat.slice(0, 60)}` })
        }
      } catch (err) {
        attempts.push({ via, error: (err as NodeJS.ErrnoException).code ?? String(err) })
      }
    })(),
    (async () => {
      const via = 'Akamai whoami'
      try {
        const addrs = await r.resolve4('whoami.akamai.net')
        if (addrs[0]) {
          add(addrs[0], via)
          attempts.push({ via, ip: addrs[0] })
        }
      } catch (err) {
        attempts.push({ via, error: (err as NodeJS.ErrnoException).code ?? String(err) })
      }
    })(),
    (async () => {
      const via = 'Akamai ds.akahelp'
      try {
        const txt = await r.resolveTxt('whoami.ds.akahelp.net')
        const flat = txt.flat()
        const nsIdx = flat.findIndex((v) => v === 'ns')
        const ipIdx = flat.findIndex((v) => v === 'ip')
        const nsIp = nsIdx >= 0 ? flat[nsIdx + 1]?.match(IPV4_RE)?.[1] : undefined
        const clientIp = ipIdx >= 0 ? flat[ipIdx + 1]?.match(IPV4_RE)?.[1] : undefined
        if (nsIp) add(nsIp, `${via} (ns)`)
        if (clientIp) add(clientIp, `${via} (ip)`)
        attempts.push({ via, ip: nsIp ?? clientIp, error: nsIp || clientIp ? undefined : '应答格式未知' })
      } catch (err) {
        attempts.push({ via, error: (err as NodeJS.ErrnoException).code ?? String(err) })
      }
    })()
  ]

  await Promise.all(tasks)

  const observations = await Promise.all(
    [...seen.values()].map(async (obs) => {
      const org = await lookupOrg(obs.ip)
      return {
        ...obs,
        country: org.country,
        countryCode: org.countryCode,
        org: org.org,
        asn: org.asn !== undefined ? String(org.asn) : undefined
      }
    })
  )

  return { observations, attempts }
}

/** NXDOMAIN 劫持：查询一个必然不存在的域名，若返回地址说明 DNS 被接管 */
async function detectNxdomainHijack(): Promise<{ hijacked: boolean; answers?: string[] }> {
  const r = systemResolver()
  const rand = Math.random().toString(36).slice(2, 10)
  try {
    const addrs = await r.resolve4(`nx-${rand}.example.com`)
    if (addrs.length) return { hijacked: true, answers: addrs }
    return { hijacked: false }
  } catch {
    return { hijacked: false }
  }
}

/** 系统解析结果与 DoH 结果比对，用于发现污染 / 分流 */
async function compareWithDoh(domain: string): Promise<{ domain: string; system: string[]; doh: string[] }> {
  const r = systemResolver()
  let system: string[] = []
  let doh: string[] = []
  try {
    system = (await r.resolve4(domain)).sort()
  } catch {
    system = []
  }
  try {
    const res = await getJson<{ Answer?: { type: number; data: string }[] }>(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`,
      7000
    )
    doh = (res.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data).sort()
  } catch {
    doh = []
  }
  return { domain, system, doh }
}

export async function runDnsCheck(exitIntel: IpIntel | null, startedAt: number): Promise<CheckResult> {
  const max = WEIGHTS.dns
  const findings: Finding[] = []
  let score: number = max
  let status: CheckResult['status'] = 'ok'

  const servers = dns.getServers()
  findings.push({
    label: '系统 DNS 服务器',
    value: servers.length ? servers.join('  ') : '未能读取',
    status: servers.length ? 'ok' : 'warn'
  })

  const [observed, hijack] = await Promise.all([observeResolvers(), detectNxdomainHijack()])
  const observations = observed.observations

  if (!observations.length) {
    findings.push({
      label: '解析器出口',
      value: '未能观测到（可能是加密 DNS 或网络限制）',
      status: 'skip',
      hint: '系统启用了 DoH/DoT 时，传统 DNS 探测拿不到解析器出口地址'
    })
    for (const a of observed.attempts) {
      findings.push({
        label: `探测 ${a.via}`,
        value: a.ip ?? `失败：${a.error ?? '无应答'}`,
        status: a.ip ? 'ok' : 'skip'
      })
    }
    return {
      id: 'dns',
      title: 'DNS 泄露',
      subtitle: '解析器出口与真实位置比对',
      status: 'skip',
      score: max,
      maxScore: max,
      summary: '无法观测解析器出口，本项跳过',
      findings,
      raw: { servers, observations, attempts: observed.attempts },
      durationMs: Date.now() - startedAt
    }
  }

  const exitAsn = exitIntel?.asn?.replace(/[^0-9]/g, '')
  const exitCc = exitIntel?.countryCode

  for (const obs of observations) {
    const sameAsn = Boolean(exitAsn && obs.asn && String(obs.asn) === exitAsn)
    const sameCountry = Boolean(exitCc && obs.countryCode && obs.countryCode === exitCc)
    const where = [obs.country, obs.org].filter(Boolean).join(' · ') || '未知归属'

    if (sameAsn) {
      findings.push({
        label: `解析器 ${obs.ip}`,
        value: `${where}（与出口同网络）`,
        status: 'ok'
      })
    } else if (!sameCountry && exitCc) {
      findings.push({
        label: `解析器 ${obs.ip}`,
        value: `${where}（与出口不同国家）`,
        status: 'risk',
        hint: '解析请求没有走代理线路，真实位置已暴露'
      })
      score -= 10
    } else if (obs.isPublicDns) {
      findings.push({
        label: `解析器 ${obs.ip}`,
        value: `${where}（公共 DNS）`,
        status: 'warn',
        hint: '使用公共 DNS 不会暴露本地 ISP，但会暴露所在区域，且部分服务会区别对待'
      })
      score -= 4
    } else {
      findings.push({
        label: `解析器 ${obs.ip}`,
        value: `${where}（与出口不同网络）`,
        status: 'warn',
        hint: '可能沿用了本地 ISP 的 DNS，建议确认代理的 DNS 处理方式'
      })
      score -= 6
    }
  }

  if (hijack.hijacked) {
    findings.push({
      label: 'NXDOMAIN 劫持',
      value: `不存在的域名被解析到 ${hijack.answers?.join(', ')}`,
      status: 'risk',
      hint: 'DNS 被本地网络接管，解析结果不可信'
    })
    score -= 6
  } else {
    findings.push({ label: 'NXDOMAIN 劫持', value: '未发现', status: 'ok' })
  }

  // 污染比对只作为参考信息，不参与扣分，避免 CDN 调度造成误报
  const polls = await Promise.all([compareWithDoh('www.wikipedia.org'), compareWithDoh('www.cloudflare.com')])
  for (const p of polls) {
    if (!p.system.length || !p.doh.length) continue
    const same = p.system.join(',') === p.doh.join(',')
    findings.push({
      label: `解析比对 ${p.domain}`,
      value: same ? '与 DoH 一致' : `系统 ${p.system.join(',')} / DoH ${p.doh.join(',')}`,
      status: same ? 'ok' : 'warn',
      hint: same ? undefined : '结果不同可能是 CDN 就近调度，也可能是污染或分流，仅作参考'
    })
  }

  score = Math.max(0, Math.min(max, score))
  status = score < max * 0.5 ? 'risk' : score < max * 0.85 ? 'warn' : 'ok'

  const leak = findings.some((f) => f.status === 'risk' && f.label.startsWith('解析器'))
  const summary = leak
    ? '解析器出口与代理出口不在同一网络，DNS 存在泄露'
    : score < max
      ? '解析器出口可用，但归属与出口不完全一致'
      : 'DNS 解析走了与出口相同的线路，未发现泄露'

  return {
    id: 'dns',
    title: 'DNS 泄露',
    subtitle: '解析器出口与真实位置比对',
    status,
    score,
    maxScore: max,
    summary,
    findings,
    raw: { servers, observations, hijack, attempts: observed.attempts },
    durationMs: Date.now() - startedAt
  }
}
