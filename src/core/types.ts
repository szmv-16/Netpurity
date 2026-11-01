/** 通用结果类型 */

export type Status = 'ok' | 'warn' | 'risk' | 'error' | 'skip'

export interface Finding {
  label: string
  value: string
  status: Status
  hint?: string
}

export interface CheckResult {
  id: string
  title: string
  subtitle: string
  status: Status
  /** 本项得分 */
  score: number
  /** 本项满分 */
  maxScore: number
  summary: string
  findings: Finding[]
  raw?: unknown
  durationMs: number
}

export interface IpSourceResult {
  name: string
  ip?: string
  ms: number
  error?: string
}

export interface ExitIpInfo {
  ipv4?: string
  ipv6?: string
  /** 各探测源原始结果 */
  sources: IpSourceResult[]
  /** 所有成功源是否返回同一个地址 */
  consistent: boolean
}

export type IpClass = 'residential' | 'mobile' | 'datacenter' | 'vpn' | 'unknown'

export interface IpIntel {
  ip: string
  country?: string
  countryCode?: string
  region?: string
  city?: string
  timezone?: string
  isp?: string
  org?: string
  asn?: string
  asName?: string
  isMobile: boolean
  isProxy: boolean
  isHosting: boolean
  ptr?: string
  /** 由 ASN / 名称 / 标记综合得出的类型 */
  ipClass: IpClass
  classReason: string
  /** 各数据源原始返回，UI 里可展开查看 */
  sources: Record<string, unknown>
}

export interface ResolverObservation {
  /** 观测到的解析器出口 IP */
  ip: string
  /** 观测来源，如 google-txt / akamai-a */
  via: string
  country?: string
  countryCode?: string
  org?: string
  asn?: string
  isPublicDns: boolean
}

export interface WebRtcCandidate {
  type: 'host' | 'srflx' | 'relay' | 'prflx' | 'unknown'
  address: string
  port?: number
  protocol?: string
}

export interface WebRtcResult {
  supported: boolean
  /** 浏览器是否用 mDNS 隐藏了内网地址 */
  mdnsObscured: boolean
  candidates: WebRtcCandidate[]
  publicIps: string[]
  privateIps: string[]
  error?: string
}

export interface SystemInfo {
  platform: string
  release: string
  arch: string
  locale: string
  timezone: string
  dnsServers: string[]
  proxy: {
    enabled: boolean
    server?: string
    bypass?: string
    source: 'registry' | 'env' | 'none'
  }
  interfaces: { name: string; addresses: string[] }[]
}

export interface ScanReport {
  startedAt: string
  finishedAt: string
  durationMs: number
  exit: ExitIpInfo
  intel: IpIntel | null
  checks: CheckResult[]
  score: number
  grade: Grade
  /** 是否存在未完成的检测项（如无法观测 DNS、WebRTC 不可用） */
  partial: boolean
  /** 未完成检测项的名称 */
  skipped: string[]
  /** 检测过程中出现的非致命错误 */
  errors: string[]
}

export interface Grade {
  label: string
  tone: Status
  description: string
}

export interface ScanOptions {
  webrtc?: WebRtcResult
  system?: SystemInfo
  onProgress?: (patch: ProgressEvent) => void
}

export interface ProgressEvent {
  id: string
  title: string
  status: 'running' | 'done' | Status
  message?: string
  score?: number
  maxScore?: number
}
