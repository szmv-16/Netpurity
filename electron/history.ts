import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ScanReport } from '../src/core/types.ts'

export interface HistoryEntry {
  id: string
  at: string
  score: number
  gradeLabel: string
  gradeTone: string
  ip?: string
  country?: string
  asn?: string
  durationMs: number
  report: ScanReport
}

/** 只保留最近 50 次，单条约 15KB，总共不到 1MB */
const MAX_ENTRIES = 50

function historyFile(): string {
  return join(app.getPath('userData'), 'history.json')
}

export async function listHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await fs.readFile(historyFile(), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : []
  } catch {
    return []
  }
}

export async function addHistory(report: ScanReport): Promise<HistoryEntry[]> {
  const entries = await listHistory()
  const entry: HistoryEntry = {
    id: randomUUID(),
    at: report.startedAt,
    score: report.score,
    gradeLabel: report.grade.label,
    gradeTone: report.grade.tone,
    ip: report.intel?.ip ?? report.exit.ipv4,
    country: report.intel?.country,
    asn: report.intel?.asn,
    durationMs: report.durationMs,
    report
  }
  const next = [entry, ...entries].slice(0, MAX_ENTRIES)
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(historyFile(), JSON.stringify(next), 'utf8')
  return next
}

export async function clearHistory(): Promise<HistoryEntry[]> {
  await fs.rm(historyFile(), { force: true })
  return []
}
