import { probeExitIp } from './probes/exit-ip.ts'
import { lookupIp } from './probes/ip-intel.ts'
import { runIpPurityCheck } from './probes/ip-purity.ts'
import { runReputationCheck } from './probes/blacklist.ts'
import { runDnsCheck } from './probes/dns.ts'
import { runWebRtcCheck } from './probes/webrtc.ts'
import { runConsistencyCheck } from './probes/consistency.ts'
import { collectSystemInfo } from './probes/system.ts'
import { gradeFor } from './weights.ts'
import type { CheckResult, ExitIpInfo, ProgressEvent, ScanOptions, ScanReport } from './types.ts'

function exitCheck(exit: ExitIpInfo, startedAt: number): CheckResult {
  const okSources = exit.sources.filter((s) => s.ip).length
  const status: CheckResult['status'] = !exit.ipv4 ? 'error' : exit.consistent ? 'ok' : 'warn'
  return {
    id: 'exit',
    title: '出口 IP',
    subtitle: '多源交叉验证当前真实出口',
    status,
    score: 0,
    maxScore: 0,
    summary: exit.ipv4
      ? exit.consistent
        ? `${okSources} 个探测源一致指向 ${exit.ipv4}`
        : '不同探测源看到了不同的出口地址'
      : '所有出口探测源均失败',
    findings: [
      { label: 'IPv4 出口', value: exit.ipv4 ?? '未获取', status: exit.ipv4 ? 'ok' : 'error' },
      ...(exit.ipv6
        ? [{ label: 'IPv6 出口', value: exit.ipv6, status: 'ok' as const }]
        : [{ label: 'IPv6 出口', value: '未检测到（可能是好事，也可能只是没有 v6）', status: 'skip' as const }]),
      ...exit.sources.map((s) => ({
        label: s.name,
        value: s.ip ? `${s.ip}（${s.ms}ms）` : `失败：${s.error ?? '未知错误'}`,
        status: s.ip ? ('ok' as const) : ('skip' as const)
      }))
    ],
    raw: exit,
    durationMs: Date.now() - startedAt
  }
}

export async function runScan(opts: ScanOptions = {}): Promise<ScanReport> {
  const startedAt = Date.now()
  const startedIso = new Date(startedAt).toISOString()
  const errors: string[] = []
  const checks: CheckResult[] = []
  const emit = (e: ProgressEvent) => {
    try {
      opts.onProgress?.(e)
    } catch {
      /* 进度回调不应影响检测 */
    }
  }

  emit({ id: 'exit', title: '出口 IP', status: 'running' })
  let exit: ExitIpInfo
  try {
    exit = await probeExitIp()
  } catch (err) {
    exit = { sources: [], consistent: false }
    errors.push(`出口探测失败：${err instanceof Error ? err.message : String(err)}`)
  }
  const exitResult = exitCheck(exit, startedAt)
  checks.push(exitResult)
  emit({ id: 'exit', title: '出口 IP', status: exitResult.status, message: exitResult.summary })

  emit({ id: 'intel', title: 'IP 归属', status: 'running' })
  const intel = exit.ipv4 ? await lookupIp(exit.ipv4).catch(() => null) : null
  if (!intel) errors.push('IP 归属情报查询失败')
  emit({ id: 'intel', title: 'IP 归属', status: intel ? 'done' : 'error' })

  const system = opts.system ?? (await collectSystemInfo().catch(() => undefined))

  emit({ id: 'ip-purity', title: 'IP 纯净度', status: 'running' })
  emit({ id: 'reputation', title: '信誉与黑名单', status: 'running' })
  emit({ id: 'dns', title: 'DNS 泄露', status: 'running' })
  emit({ id: 'consistency', title: '环境一致性', status: 'running' })

  const [purity, reputation, dns, consistency] = await Promise.all([
    Promise.resolve(runIpPurityCheck(exit, intel, Date.now())),
    intel
      ? runReputationCheck(intel, Date.now()).catch((err) => {
          errors.push(`黑名单查询失败：${String(err)}`)
          return null
        })
      : Promise.resolve(null),
    runDnsCheck(intel, Date.now()).catch((err) => {
      errors.push(`DNS 检测失败：${String(err)}`)
      return null
    }),
    Promise.resolve(runConsistencyCheck(intel, system, Date.now()))
  ])

  checks.push(purity)
  if (reputation) checks.push(reputation)
  checks.push(dns ?? {
    id: 'dns',
    title: 'DNS 泄露',
    subtitle: '解析器出口与真实位置比对',
    status: 'error' as const,
    score: 0,
    maxScore: 20,
    summary: 'DNS 检测未能完成',
    findings: [],
    durationMs: 0
  })
  checks.push(consistency)

  emit({ id: 'webrtc', title: 'WebRTC 泄露', status: 'running' })
  const webrtc = runWebRtcCheck(exit, opts.webrtc, Date.now())
  checks.push(webrtc)

  for (const c of [purity, reputation, dns, consistency, webrtc]) {
    if (c) emit({ id: c.id, title: c.title, status: c.status, score: c.score, maxScore: c.maxScore })
  }

  // 跳过的项不计入分母，避免“没测到”反而拉高或拉低总分
  const scored = checks.filter((c) => c.maxScore > 0 && c.status !== 'skip' && c.status !== 'error')
  const maxTotal = scored.reduce((sum, c) => sum + c.maxScore, 0)
  const gained = scored.reduce((sum, c) => sum + c.score, 0)
  const score = maxTotal > 0 ? Math.round((gained / maxTotal) * 100) : 0

  const skipped = checks.filter((c) => c.status === 'skip').map((c) => c.title)
  const partial = skipped.length > 0
  const grade = gradeFor(score)
  // 关键项没测到就不该给出“纯净”的结论
  const finalGrade = partial && grade.tone === 'ok'
    ? { ...grade, label: '部分未测', tone: 'warn' as const, description: '部分检测项未能完成，结论仅供参考。' }
    : grade

  return {
    startedAt: startedIso,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    exit,
    intel,
    checks,
    score,
    grade: finalGrade,
    partial,
    skipped,
    errors
  }
}
