import type { CheckResult, Finding, IpIntel, SystemInfo } from '../types.ts'
import { WEIGHTS } from '../weights.ts'

/** 取某时区在指定时刻相对 UTC 的偏移分钟数 */
export function offsetMinutes(tz: string, at = new Date()): number | null {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    const part = dtf.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? ''
    const m = part.match(/GMT([+-])(\d{2}):(\d{2})/)
    if (!m) return part === 'GMT' ? 0 : null
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
  } catch {
    return null
  }
}

/** 语言标签里的地区，如 zh-CN → CN */
function regionOf(locale: string): string | undefined {
  const parts = locale.replace('_', '-').split('-')
  const region = parts.find((p) => /^[A-Za-z]{2}$/.test(p) && p !== parts[0])
  return region?.toUpperCase()
}

export function runConsistencyCheck(
  intel: IpIntel | null,
  system: SystemInfo | undefined,
  startedAt: number
): CheckResult {
  const max = WEIGHTS.consistency
  const findings: Finding[] = []
  let score: number = max

  if (!intel || !system) {
    return {
      id: 'consistency',
      title: '环境一致性',
      subtitle: '时区、语言与出口是否自洽',
      status: 'skip',
      score: max,
      maxScore: max,
      summary: '缺少系统信息，本项跳过',
      findings,
      durationMs: Date.now() - startedAt
    }
  }

  // 1. 时区是否与 IP 所在地一致
  if (intel.timezone) {
    const localOff = offsetMinutes(system.timezone)
    const ipOff = offsetMinutes(intel.timezone)
    if (localOff !== null && ipOff !== null) {
      const diff = Math.abs(localOff - ipOff)
      if (diff === 0) {
        findings.push({
          label: '时区一致',
          value: `本机 ${system.timezone}，IP 归属 ${intel.timezone}`,
          status: 'ok'
        })
      } else {
        findings.push({
          label: '时区不一致',
          value: `本机 ${system.timezone} (UTC${localOff >= 0 ? '+' : ''}${localOff / 60})，IP 归属 ${intel.timezone} (UTC${ipOff >= 0 ? '+' : ''}${ipOff / 60})`,
          status: diff > 60 ? 'risk' : 'warn',
          hint: '时区与出口所在地不符是风控常用的关联信号'
        })
        score -= diff > 60 ? 6 : 3
      }
    } else {
      findings.push({ label: '时区', value: `${system.timezone} / ${intel.timezone}`, status: 'skip' })
    }
  }

  // 2. 语言地区是否与 IP 国家一致
  const region = regionOf(system.locale)
  if (region && intel.countryCode) {
    if (region === intel.countryCode) {
      findings.push({ label: '语言地区一致', value: `${system.locale} ↔ ${intel.countryCode}`, status: 'ok' })
    } else {
      findings.push({
        label: '语言地区不一致',
        value: `${system.locale} ↔ ${intel.countryCode}`,
        status: 'warn',
        hint: '系统语言地区与出口国家不同，属于弱信号，单独出现不必紧张'
      })
      score -= 2
    }
  }

  // 3. 系统代理配置（不是风险，但对判断“代理是否真的生效”很有用）
  findings.push({
    label: '系统代理',
    value: system.proxy.enabled ? `${system.proxy.server ?? '已启用'}（${system.proxy.source}）` : '未启用',
    status: 'ok'
  })

  findings.push({
    label: '活动网卡',
    value:
      system.interfaces
        .map((i) => `${i.name}: ${i.addresses.join(', ')}`)
        .slice(0, 4)
        .join(' | ') || '无',
    status: 'ok'
  })

  score = Math.max(0, Math.min(max, score))
  const status: CheckResult['status'] = score < max * 0.5 ? 'risk' : score < max ? 'warn' : 'ok'

  return {
    id: 'consistency',
    title: '环境一致性',
    subtitle: '时区、语言与出口是否自洽',
    status,
    score,
    maxScore: max,
    summary:
      score === max ? '本机环境与出口所在地一致' : '本机环境与出口所在地存在不一致，可能被风控关联',
    findings,
    raw: { system },
    durationMs: Date.now() - startedAt
  }
}
