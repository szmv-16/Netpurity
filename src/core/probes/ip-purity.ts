import type { CheckResult, ExitIpInfo, Finding, IpIntel } from '../types.ts'
import { WEIGHTS } from '../weights.ts'

const CLASS_LABEL: Record<IpIntel['ipClass'], string> = {
  residential: '住宅宽带',
  mobile: '移动网络',
  datacenter: '机房 / 数据中心',
  vpn: '代理 / VPN 出口',
  unknown: '未能判定'
}

export function runIpPurityCheck(
  exit: ExitIpInfo,
  intel: IpIntel | null,
  startedAt: number
): CheckResult {
  const max = WEIGHTS['ip-purity']
  const findings: Finding[] = []
  let score: number = max

  if (!intel) {
    return {
      id: 'ip-purity',
      title: 'IP 纯净度',
      subtitle: '类型、原生性、网络归属',
      status: 'error',
      score: 0,
      maxScore: max,
      summary: '无法获取 IP 归属信息，所有情报源均不可用',
      findings: [
        { label: '情报查询', value: '全部失败', status: 'error', hint: '检查网络连通性或稍后重试' }
      ],
      durationMs: Date.now() - startedAt
    }
  }

  findings.push({
    label: 'IP 类型',
    value: CLASS_LABEL[intel.ipClass],
    status: intel.ipClass === 'residential' || intel.ipClass === 'mobile' ? 'ok' : 'warn',
    hint: intel.classReason
  })

  switch (intel.ipClass) {
    case 'datacenter':
      score -= 16
      break
    case 'vpn':
      score -= 22
      break
    case 'unknown':
      score -= 7
      break
    default:
      break
  }

  const geo = [intel.country, intel.region, intel.city].filter(Boolean).join(' · ')
  findings.push({ label: '归属地', value: geo || '未知', status: geo ? 'ok' : 'warn' })

  if (intel.asn) {
    findings.push({
      label: '网络',
      value: `${intel.asn}${intel.asName || intel.org ? ` · ${intel.asName ?? intel.org}` : ''}`,
      status: 'ok'
    })
  }

  if (intel.ptr) {
    const suspicious = /(vpn|proxy|server|hosting|cloud|dedicated|vps)/i.test(intel.ptr)
    findings.push({
      label: '反向解析 PTR',
      value: intel.ptr,
      status: suspicious ? 'warn' : 'ok',
      hint: suspicious ? 'PTR 记录包含服务器 / 代理特征' : undefined
    })
    if (suspicious) score -= 4
  } else {
    findings.push({
      label: '反向解析 PTR',
      value: '无 PTR 记录',
      status: 'warn',
      hint: '缺省 PTR 在部分风控中会被视为可疑，但证据很弱'
    })
    score -= 2
  }

  if (exit.consistent) {
    findings.push({
      label: '多源一致性',
      value: `${exit.sources.filter((s) => s.ip).length} 个探测源结果一致`,
      status: 'ok'
    })
  } else {
    const answers = exit.sources
      .filter((s) => s.ip)
      .map((s) => `${s.name}=${s.ip}`)
      .join('，')
    findings.push({
      label: '多源一致性',
      value: `探测源返回了不同地址：${answers}`,
      status: 'risk',
      hint: '不同目标看到不同出口，通常是透明代理 / 分流规则 / 出口池轮换'
    })
    score -= 8
  }

  if (intel.isHosting && intel.ipClass !== 'datacenter') {
    score -= 3
    findings.push({ label: '托管标记', value: '情报源标记为托管网络', status: 'warn' })
  }

  score = Math.max(0, Math.min(max, score))
  const status: CheckResult['status'] =
    score < max * 0.5 ? 'risk' : score < max * 0.8 ? 'warn' : 'ok'

  const summary =
    intel.ipClass === 'residential' || intel.ipClass === 'mobile'
      ? `出口是${CLASS_LABEL[intel.ipClass]}，类型层面可信`
      : intel.ipClass === 'unknown'
        ? '出口类型不明确，情报源未能确认是否为机房'
        : `出口属于${CLASS_LABEL[intel.ipClass]}，${intel.classReason}`

  return {
    id: 'ip-purity',
    title: 'IP 纯净度',
    subtitle: '类型、原生性、网络归属',
    status,
    score,
    maxScore: max,
    summary,
    findings,
    raw: { exit, intel },
    durationMs: Date.now() - startedAt
  }
}
