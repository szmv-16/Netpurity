import type { CheckResult, Finding, ExitIpInfo, WebRtcResult } from '../types.ts'
import { WEIGHTS } from '../weights.ts'

function isPrivate(ip: string): boolean {
  if (ip.includes(':')) {
    return /^(fc|fd|fe80|::1)/i.test(ip)
  }
  const p = ip.split('.').map(Number)
  return (
    p[0] === 10 ||
    p[0] === 127 ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 169 && p[1] === 254)
  )
}

export function runWebRtcCheck(
  exit: ExitIpInfo,
  result: WebRtcResult | undefined,
  startedAt: number
): CheckResult {
  const max = WEIGHTS.webrtc
  const findings: Finding[] = []
  let score: number = max

  if (!result || !result.supported) {
    return {
      id: 'webrtc',
      title: 'WebRTC 泄露',
      subtitle: '浏览器 UDP 是否绕过代理',
      status: 'skip',
      score: max,
      maxScore: max,
      summary: result?.error ?? '当前环境不支持检测 WebRTC',
      findings: [
        { label: 'WebRTC', value: result?.error ?? '不支持', status: 'skip' }
      ],
      durationMs: Date.now() - startedAt
    }
  }

  const exitIp = exit.ipv4
  const foreign = result.publicIps.filter((ip) => ip !== exitIp && !isPrivate(ip))

  if (result.mdnsObscured) {
    findings.push({
      label: '内网地址',
      value: '已被浏览器 mDNS 混淆（.local）',
      status: 'ok',
      hint: 'Chrome / Edge 默认隐藏内网 IP，这是隐私保护而非泄露'
    })
  } else if (result.privateIps.length) {
    findings.push({
      label: '内网地址',
      value: result.privateIps.join(', '),
      status: 'warn',
      hint: '内网 IP 可被网页读取，配合其它信息可用于定位局域网'
    })
    score -= 2
  } else {
    findings.push({ label: '内网地址', value: '未获取到', status: 'ok' })
  }

  if (foreign.length) {
    findings.push({
      label: '公网候选地址',
      value: foreign.join(', '),
      status: 'risk',
      hint: `与 HTTP 出口 ${exitIp ?? '未知'} 不一致，说明浏览器 UDP 流量没有走代理`
    })
    score -= 12
  } else if (result.publicIps.length) {
    findings.push({
      label: '公网候选地址',
      value: `${result.publicIps.join(', ')}（与出口一致）`,
      status: 'ok'
    })
  } else {
    findings.push({
      label: '公网候选地址',
      value: '未获取到 srflx 候选',
      status: 'warn',
      hint: '可能是 STUN 被阻断或 UDP 未放行，这种情况通常不会泄露，但也无法证明安全'
    })
    score -= 3
  }

  const v6 = result.candidates.filter((c) => c.address.includes(':'))
  if (v6.length) {
    findings.push({
      label: 'IPv6 候选',
      value: v6.map((c) => `${c.type}:${c.address}`).join(', '),
      status: 'warn',
      hint: 'IPv6 直连是常见的代理绕过路径，若代理不支持 v6 会直接暴露真实地址'
    })
    score -= 3
  }

  findings.push({
    label: '候选统计',
    value: result.candidates.length
      ? result.candidates.map((c) => `${c.type}`).join(', ')
      : '无',
    status: 'ok'
  })

  score = Math.max(0, Math.min(max, score))
  const status: CheckResult['status'] = foreign.length ? 'risk' : score < max * 0.8 ? 'warn' : 'ok'

  return {
    id: 'webrtc',
    title: 'WebRTC 泄露',
    subtitle: '浏览器 UDP 是否绕过代理',
    status,
    score,
    maxScore: max,
    summary: foreign.length
      ? 'WebRTC 暴露了非出口 IP，存在真实地址泄露'
      : result.publicIps.length
        ? 'WebRTC 对外地址与出口一致，未发现泄露'
        : '未能取得 WebRTC 公网地址，无法完全确认',
    findings,
    raw: result,
    durationMs: Date.now() - startedAt
  }
}
