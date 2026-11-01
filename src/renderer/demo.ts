import type { ProgressEvent, ScanReport, Status } from '../core/types.ts'
import type { UnlockResult } from '../core/probes/unlock.ts'
import { UNLOCK_SERVICES } from '../core/probes/unlock.ts'
import type { HistoryEntry } from '../../electron/preload.ts'
// 一次真实检测的完整输出，用于验证风险态（红卡）样式；不带 ?real=1 时用下面的干净样例
import sampleReport from './sample-report.json'

/**
 * 预览模式：在没有 Electron 预加载脚本的环境（浏览器 / 截图 / 设计评审）下
 * 用一份内置样例报告渲染界面。真实检测永远走主进程。
 */
const CLEAN_REPORT: ScanReport = {
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: 6842,
  exit: {
    ipv4: '203.0.113.42',
    consistent: true,
    sources: [
      { name: 'ipify', ip: '203.0.113.42', ms: 182 },
      { name: 'ipwho.is', ip: '203.0.113.42', ms: 240 },
      { name: 'icanhazip', ip: '203.0.113.42', ms: 310 },
      { name: 'ifconfig.me', ip: '203.0.113.42', ms: 402 },
      { name: 'ipinfo', ip: '203.0.113.42', ms: 288 }
    ]
  },
  intel: {
    ip: '203.0.113.42',
    country: 'Hong Kong',
    countryCode: 'HK',
    region: 'Hong Kong',
    city: 'Hong Kong',
    timezone: 'Asia/Hong_Kong',
    isp: 'Example Telecom IMS Limited',
    org: 'Example Telecom Global HK Limited',
    asn: 'AS4760',
    asName: 'EXAMPLE-AP',
    isMobile: false,
    isProxy: false,
    isHosting: false,
    ptr: '42-113-0-203.static.example.net',
    ipClass: 'residential',
    classReason: '网络名称符合 ISP 特征：示例 ISP 网络',
    sources: {}
  },
  checks: [
    {
      id: 'exit',
      title: '出口 IP',
      subtitle: '多源交叉验证当前真实出口',
      status: 'ok',
      score: 0,
      maxScore: 0,
      summary: '5 个探测源一致指向 203.0.113.42',
      findings: [],
      durationMs: 402
    },
    {
      id: 'ip-purity',
      title: 'IP 纯净度',
      subtitle: '类型、原生性、网络归属',
      status: 'ok',
      score: 33,
      maxScore: 35,
      summary: '出口是住宅宽带，类型层面可信',
      findings: [
        { label: 'IP 类型', value: '住宅宽带', status: 'ok', hint: '网络名称符合 ISP 特征' },
        { label: '归属地', value: 'Hong Kong · Hong Kong · Hong Kong', status: 'ok' },
        { label: '网络', value: 'AS4760 · EXAMPLE-AP', status: 'ok' },
        { label: '反向解析 PTR', value: '209-9-203-174.static.as3491.net', status: 'ok' },
        { label: '多源一致性', value: '5 个探测源结果一致', status: 'ok' }
      ],
      durationMs: 12
    },
    {
      id: 'reputation',
      title: '信誉与黑名单',
      subtitle: '反滥用数据库与代理标记',
      status: 'ok',
      score: 20,
      maxScore: 20,
      summary: '未命中反滥用黑名单，也无代理标记',
      findings: [
        { label: 'DroneBL', value: '未列入', status: 'ok' },
        { label: 'SpamCop', value: '未列入', status: 'ok' },
        { label: 'S5H', value: '未列入', status: 'ok' },
        { label: 'UCEPROTECT L1', value: '未列入', status: 'ok' },
        { label: '代理 / VPN 标记', value: '未标记', status: 'ok' }
      ],
      durationMs: 1830
    },
    {
      id: 'dns',
      title: 'DNS 泄露',
      subtitle: '解析器出口与真实位置比对',
      status: 'ok',
      score: 20,
      maxScore: 20,
      summary: 'DNS 解析走了与出口相同的线路，未发现泄露',
      findings: [
        { label: '系统 DNS 服务器', value: '192.168.1.1', status: 'ok' },
        { label: '解析器 203.0.113.42', value: 'Hong Kong · Example Telecom（与出口同网络）', status: 'ok' },
        { label: 'NXDOMAIN 劫持', value: '未发现', status: 'ok' },
        { label: '解析比对 www.cloudflare.com', value: '与 DoH 一致', status: 'ok' }
      ],
      durationMs: 2210
    },
    {
      id: 'webrtc',
      title: 'WebRTC 泄露',
      subtitle: '浏览器 UDP 是否绕过代理',
      status: 'ok',
      score: 15,
      maxScore: 15,
      summary: 'WebRTC 对外地址与出口一致，未发现泄露',
      findings: [
        { label: '内网地址', value: '已被浏览器 mDNS 混淆（.local）', status: 'ok' },
        { label: '公网候选地址', value: '203.0.113.42（与出口一致）', status: 'ok' },
        { label: '候选统计', value: 'host, srflx', status: 'ok' }
      ],
      durationMs: 4210
    },
    {
      id: 'consistency',
      title: '环境一致性',
      subtitle: '时区、语言与出口是否自洽',
      status: 'warn',
      score: 8,
      maxScore: 10,
      summary: '本机环境与出口所在地存在不一致，可能被风控关联',
      findings: [
        { label: '时区一致', value: '本机 Asia/Shanghai，IP 归属 Asia/Hong_Kong', status: 'ok' },
        { label: '语言地区不一致', value: 'zh-CN ↔ HK', status: 'warn', hint: '属于弱信号，单独出现不必紧张' },
        { label: '系统代理', value: 'http://127.0.0.1:7890（env）', status: 'ok' }
      ],
      durationMs: 3
    }
  ],
  score: 96,
  grade: { label: '纯净', tone: 'ok', description: '出口与环境高度一致，风控层面几乎没有可疑信号。' },
  partial: false,
  skipped: [],
  errors: []
}

export const DEMO_REPORT: ScanReport =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('real')
    ? (sampleReport as unknown as ScanReport)
    : CLEAN_REPORT

function gradeOf(score: number): { label: string; tone: Status } {
  if (score >= 85) return { label: '纯净', tone: 'ok' }
  if (score >= 70) return { label: '良好', tone: 'warn' }
  if (score >= 55) return { label: '一般', tone: 'warn' }
  return { label: '高风险', tone: 'risk' }
}

const DEMO_HISTORY: HistoryEntry[] = [0, 8, 15].map((gap, i) => {
  const score = Math.max(0, DEMO_REPORT.score - gap)
  const g = gradeOf(score)
  return {
    id: `demo-${i}`,
    at: new Date(Date.now() - (i === 0 ? 0.2 : i === 1 ? 26 : 51) * 3600_000).toISOString(),
    score,
    gradeLabel: g.label,
    gradeTone: g.tone,
    ip: DEMO_REPORT.intel?.ip,
    country: DEMO_REPORT.intel?.country,
    asn: DEMO_REPORT.intel?.asn,
    durationMs: DEMO_REPORT.durationMs,
    report: { ...DEMO_REPORT, score, grade: { ...DEMO_REPORT.grade, label: g.label, tone: g.tone } }
  } satisfies HistoryEntry
})

const DEMO_UNLOCK_STATE: Record<string, { state: UnlockResult['state']; status?: number; detail: string }> = {
  netflix: { state: 'ok', status: 200, detail: 'HTTP 200，页面正常返回，未发现地区限制提示' },
  disney: { state: 'blocked', status: 200, detail: '页面提示地区受限（命中「not available in your region」）' },
  primevideo: { state: 'ok', status: 200, detail: 'HTTP 200，页面正常返回，未发现地区限制提示' },
  'youtube-premium': { state: 'ok', status: 200, detail: 'HTTP 200，页面正常返回，未发现地区限制提示' },
  spotify: { state: 'ok', status: 200, detail: 'HTTP 200，页面正常返回，未发现地区限制提示' },
  tiktok: { state: 'unknown', status: 403, detail: '返回 403，可能是地区限制，也可能是人机验证，需人工确认' },
  bilibili: { state: 'unreachable', detail: '连接失败（被阻断或网络不可达）' },
  chatgpt: { state: 'ok', status: 200, detail: 'HTTP 200，页面正常返回，未发现地区限制提示' },
  claude: { state: 'blocked', status: 403, detail: '页面提示地区受限（命中「not available in your region」）' },
  gemini: { state: 'ok', status: 200, detail: 'HTTP 200，页面正常返回，未发现地区限制提示' }
}

const DEMO_UNLOCK: UnlockResult[] = UNLOCK_SERVICES.map((s, i) => {
  const d = DEMO_UNLOCK_STATE[s.id] ?? { state: 'ok' as const, status: 200, detail: '演示数据' }
  return { id: s.id, name: s.name, state: d.state, detail: d.detail, status: d.status, ms: 400 + i * 137 }
})

export function createDemoApi() {
  return {
    async runScan(): Promise<ScanReport> {
      await new Promise((r) => setTimeout(r, 600))
      return DEMO_REPORT
    },
    onProgress(cb: (p: ProgressEvent) => void) {
      const steps = ['exit', 'ip-purity', 'reputation', 'dns', 'webrtc', 'consistency']
      steps.forEach((id, i) => setTimeout(() => cb({ id, title: id, status: 'ok' }), 80 * (i + 1)))
      return () => undefined
    },
    async getSystem() {
      return null
    },
    async openExternal() {
      return undefined
    },
    async version() {
      return '0.1.0-preview'
    },
    async versions() {
      return { app: '0.1.0', electron: '33.4.11', chrome: '130.0.6723.191', node: '20.18.3', platform: 'win32 x64' }
    },
    async listHistory() {
      return DEMO_HISTORY
    },
    async addHistory() {
      return DEMO_HISTORY
    },
    async clearHistory() {
      return []
    },
    async exportJson() {
      return { ok: false, canceled: true }
    },
    async exportPdf() {
      return { ok: false, canceled: true }
    },
    async copyText() {
      return false
    },
    async unlockServices() {
      return UNLOCK_SERVICES
    },
    async unlockTest(id: string) {
      await new Promise((r) => setTimeout(r, 400))
      return DEMO_UNLOCK.find((r) => r.id === id) ?? DEMO_UNLOCK[0]
    },
    async unlockTestAll() {
      await new Promise((r) => setTimeout(r, 600))
      return DEMO_UNLOCK
    },
    onUnlockProgress() {
      return () => undefined
    }
  }
}
