import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as dns } from 'node:dns'
import type { SystemInfo } from '../types.ts'

const exec = promisify(execFile)

async function readWindowsDnsServers(): Promise<string[]> {
  try {
    const { stdout } = await exec(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-DnsClientServerAddress -AddressFamily IPv4,IPv6 | Where-Object { $_.ServerAddresses.Count -gt 0 } | Select-Object -ExpandProperty ServerAddresses -Unique'
      ],
      { timeout: 8000, windowsHide: true }
    )
    return stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^[0-9a-f.:]+$/i.test(s))
  } catch {
    return []
  }
}

async function readWindowsProxy(): Promise<SystemInfo['proxy']> {
  try {
    const { stdout } = await exec(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' | Select-Object ProxyEnable,ProxyServer,ProxyOverride | ConvertTo-Json -Compress"
      ],
      { timeout: 8000, windowsHide: true }
    )
    const j = JSON.parse(stdout) as { ProxyEnable?: number; ProxyServer?: string; ProxyOverride?: string }
    if (j.ProxyEnable === 1 && j.ProxyServer) {
      return { enabled: true, server: j.ProxyServer, bypass: j.ProxyOverride, source: 'registry' }
    }
  } catch {
    /* 非 Windows 或读取失败，走环境变量兜底 */
  }

  const envProxy = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy
  if (envProxy) return { enabled: true, server: envProxy, source: 'env' }
  return { enabled: false, source: 'none' }
}

function listInterfaces(): { name: string; addresses: string[] }[] {
  const out: { name: string; addresses: string[] }[] = []
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (!addrs?.length) continue
    out.push({
      name,
      addresses: addrs.filter((a) => !a.internal).map((a) => a.address)
    })
  }
  return out.filter((i) => i.addresses.length)
}

export async function collectSystemInfo(): Promise<SystemInfo> {
  const isWindows = process.platform === 'win32'
  const [winDns, proxy] = await Promise.all([
    isWindows ? readWindowsDnsServers() : Promise.resolve([]),
    isWindows ? readWindowsProxy() : Promise.resolve({ enabled: false, source: 'none' } as SystemInfo['proxy'])
  ])

  const nodeDns = dns.getServers()
  const dnsServers = [...new Set([...winDns, ...nodeDns])]

  return {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dnsServers,
    proxy,
    interfaces: listInterfaces()
  }
}
