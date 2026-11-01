import { Resolver } from 'node:dns/promises'
import type { CheckResult, Finding, IpIntel } from '../types.ts'
import { WEIGHTS } from '../weights.ts'

/**
 * 公开 DNSBL 黑名单。全部免费、无需注册。
 * 注意：Spamhaus ZEN 自 2024 年起要求注册后才允许公共查询，默认不启用。
 */
export const BLACKLISTS: { name: string; zone: string; lookup: string }[] = [
  { name: 'DroneBL', zone: 'dnsbl.dronebl.org', lookup: 'https://dronebl.org/lookup?ip=' },
  { name: 'SpamCop', zone: 'bl.spamcop.net', lookup: 'https://www.spamcop.net/w3m?action=checkblock&ip=' },
  { name: 'S5H', zone: 'all.s5h.net', lookup: 'https://s5h.net/' },
  { name: 'UCEPROTECT L1', zone: 'dnsbl-1.uceprotect.net', lookup: 'http://www.uceprotect.net/en/rblcheck.php?ipr=' }
]

type ListState = 'listed' | 'clean' | 'unknown'

interface ListResult {
  name: string
  state: ListState
  codes?: string[]
  note?: string
}

function reverseIp(ip: string): string | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return null
  return ip.split('.').reverse().join('.')
}

async function queryList(zone: string, reversed: string): Promise<{ state: ListState; codes?: string[]; note?: string }> {
  const resolver = new Resolver({ timeout: 5000, tries: 1 })
  resolver.setServers(['1.1.1.1', '8.8.8.8'])
  try {
    const addrs = await resolver.resolve4(`${reversed}.${zone}`)
    // 127.255.255.x 是各类黑名单的“查询被拒绝/额度用尽”返回码，不能当成命中
    if (addrs.some((a) => a.startsWith('127.255.255.'))) {
      return { state: 'unknown', note: '查询被拒绝或超出免费额度' }
    }
    return { state: 'listed', codes: addrs }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOTFOUND' || code === 'ENODATA') return { state: 'clean' }
    return { state: 'unknown', note: code ?? '查询失败' }
  }
}

export async function checkBlacklists(ip: string): Promise<{ results: ListResult[]; listed: number; unknown: number }> {
  const reversed = reverseIp(ip)
  if (!reversed) return { results: [], listed: 0, unknown: 0 }

  const results = await Promise.all(
    BLACKLISTS.map(async (l) => {
      const r = await queryList(l.zone, reversed)
      return { name: l.name, ...r } as ListResult
    })
  )
  return {
    results,
    listed: results.filter((r) => r.state === 'listed').length,
    unknown: results.filter((r) => r.state === 'unknown').length
  }
}

export async function runReputationCheck(intel: IpIntel, startedAt: number): Promise<CheckResult> {
  const max = WEIGHTS.reputation
  const findings: Finding[] = []
  let score: number = max
  let status: CheckResult['status'] = 'ok'

  const bl = await checkBlacklists(intel.ip)

  for (const r of bl.results) {
    if (r.state === 'listed') {
      findings.push({
        label: r.name,
        value: `已列入黑名单 (${r.codes?.join(', ')})`,
        status: 'risk',
        hint: '该 IP 出现在反滥用黑名单中，发信与部分风控会受影响'
      })
      score -= 8
    } else if (r.state === 'clean') {
      findings.push({ label: r.name, value: '未列入', status: 'ok' })
    } else {
      findings.push({ label: r.name, value: r.note ?? '无法查询', status: 'skip' })
    }
  }

  if (intel.isProxy) {
    findings.push({
      label: '代理 / VPN 标记',
      value: '已标记为代理或 VPN 出口',
      status: 'risk',
      hint: '来自 ip-api 的 proxy 字段，主流风控会直接识别'
    })
    score -= 10
  } else {
    findings.push({ label: '代理 / VPN 标记', value: '未标记', status: 'ok' })
  }

  if (intel.isHosting) {
    findings.push({ label: '托管网络标记', value: '数据中标记为机房托管', status: 'warn' })
    score -= 3
  }

  if (bl.unknown > 0) {
    findings.push({
      label: '查询完整性',
      value: `${bl.unknown} 个黑名单无法查询`,
      status: 'skip',
      hint: '部分免费黑名单限制查询频率，结果仅供参考'
    })
  }

  score = Math.max(0, Math.min(max, score))
  if (score < max * 0.5) status = 'risk'
  else if (score < max * 0.85) status = 'warn'

  const summary =
    bl.listed > 0
      ? `命中 ${bl.listed} 个黑名单${intel.isProxy ? '，且被标记为代理' : ''}`
      : intel.isProxy
        ? '未命中黑名单，但被标记为代理 / VPN'
        : '未命中反滥用黑名单，也无代理标记'

  return {
    id: 'reputation',
    title: '信誉与黑名单',
    subtitle: '反滥用数据库与代理标记',
    status,
    score,
    maxScore: max,
    summary,
    findings,
    raw: { blacklists: bl.results, intel: { proxy: intel.isProxy, hosting: intel.isHosting } },
    durationMs: Date.now() - startedAt
  }
}
