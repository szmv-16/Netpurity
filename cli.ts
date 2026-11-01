/**
 * 命令行入口：不启动界面，直接跑一遍完整检测。
 * 用途：验证检测逻辑、在服务器上做巡检、给开源贡献者调试用。
 *
 *   node cli.ts            # 完整检测
 *   node cli.ts --json     # 输出 JSON
 */
import { runScan } from './src/core/engine.ts'

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
}

const MARK: Record<string, string> = { ok: '✔', warn: '!', risk: '✖', error: '✖', skip: '–' }
const paint = (status: string, text: string) => {
  const color =
    status === 'ok' ? C.green : status === 'warn' ? C.yellow : status === 'risk' || status === 'error' ? C.red : C.dim
  return `${color}${text}${C.reset}`
}

const asJson = process.argv.includes('--json')
const started = Date.now()

const report = await runScan({
  onProgress: (e) => {
    if (!asJson) process.stderr.write(`  ${C.dim}· ${e.title} … ${e.status}${C.reset}\n`)
  }
})

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const ip = report.intel
  console.log('')
  console.log(`${C.bold}NetPurity 检测报告${C.reset}  ${C.dim}${new Date(report.startedAt).toLocaleString()}${C.reset}`)
  console.log('─'.repeat(72))
  console.log(`  出口 IPv4   ${ip?.ip ?? report.exit.ipv4 ?? '未知'}`)
  console.log(`  出口 IPv6   ${report.exit.ipv6 ?? '无'}`)
  if (ip) {
    console.log(`  归属        ${[ip.country, ip.region, ip.city].filter(Boolean).join(' · ')}`)
    console.log(`  网络        ${ip.asn ?? '-'} ${ip.asName ?? ip.org ?? ''}`)
    console.log(`  类型        ${ip.ipClass}  ${C.dim}(${ip.classReason})${C.reset}`)
  }
  console.log('─'.repeat(72))
  for (const c of report.checks) {
    if (c.maxScore === 0) continue
    const bar = `${c.score}/${c.maxScore}`.padStart(8)
    console.log(`${paint(c.status, MARK[c.status])} ${c.title.padEnd(12)} ${paint(c.status, bar)}   ${c.summary}`)
    for (const f of c.findings) {
      console.log(`    ${paint(f.status, MARK[f.status])} ${f.label}：${f.value}`)
    }
  }
  console.log('─'.repeat(72))
  const score = `${report.score} / 100`
  console.log(`${C.bold}综合评分${C.reset}  ${paint(report.grade.tone, score)}  ${report.grade.label}  ${C.dim}${report.grade.description}${C.reset}`)
  console.log(`${C.dim}耗时 ${report.durationMs}ms（含 ${Date.now() - started}ms 进程开销）${C.reset}`)
  if (report.errors.length) {
    console.log(paint('warn', `提示：${report.errors.join('；')}`))
  }
}
