import type { Grade } from './types.ts'

/** 各项检测满分，总和 100 */
export const WEIGHTS = {
  'ip-purity': 35,
  reputation: 20,
  dns: 20,
  webrtc: 15,
  consistency: 10
} as const

export type CheckId = keyof typeof WEIGHTS

export function gradeFor(score: number): Grade {
  if (score >= 85) {
    return { label: '纯净', tone: 'ok', description: '出口与环境高度一致，风控层面几乎没有可疑信号。' }
  }
  if (score >= 70) {
    return { label: '良好', tone: 'warn', description: '存在个别可疑信号，多数场景可以正常使用。' }
  }
  if (score >= 55) {
    return { label: '一般', tone: 'warn', description: '命中若干风险特征，部分严格风控的场景可能被拦截。' }
  }
  return { label: '高风险', tone: 'risk', description: '出口明显是机房或代理网络，且存在泄露或不一致，建议更换线路。' }
}

/** 检测项在 UI 中的固定顺序 */
export const CHECK_ORDER: { id: string; title: string; subtitle: string }[] = [
  { id: 'exit', title: '出口 IP', subtitle: '多源交叉验证当前真实出口' },
  { id: 'ip-purity', title: 'IP 纯净度', subtitle: '类型、原生性、网络归属' },
  { id: 'reputation', title: '信誉与黑名单', subtitle: '反滥用数据库与代理标记' },
  { id: 'dns', title: 'DNS 泄露', subtitle: '解析器出口与真实位置比对' },
  { id: 'webrtc', title: 'WebRTC 泄露', subtitle: '浏览器 UDP 是否绕过代理' },
  { id: 'consistency', title: '环境一致性', subtitle: '时区、语言与出口是否自洽' }
]
