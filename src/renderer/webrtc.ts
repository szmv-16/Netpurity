import type { WebRtcCandidate, WebRtcResult } from '../core/types.ts'

const STUN_SERVERS = ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302']

function isPrivate(ip: string): boolean {
  if (ip.includes(':')) return /^(fc|fd|fe80|::1)/i.test(ip)
  const p = ip.split('.').map(Number)
  return (
    p[0] === 10 ||
    p[0] === 127 ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 169 && p[1] === 254)
  )
}

function parseCandidate(raw: string): WebRtcCandidate | null {
  // candidate:foundation component transport priority address port typ type ...
  const parts = raw.split(' ')
  const address = parts[4]
  const port = Number(parts[5])
  const typRaw = parts[7]
  if (!address || !typRaw) return null
  const type: WebRtcCandidate['type'] =
    typRaw === 'host' || typRaw === 'srflx' || typRaw === 'relay' || typRaw === 'prflx' ? typRaw : 'unknown'
  return { type, address, port: Number.isFinite(port) ? port : undefined, protocol: parts[2] }
}

/**
 * 在渲染进程里跑 WebRTC 握手，收集 ICE 候选。
 * 关键判断：srflx（STUN 反射出的公网地址）是否等于 HTTP 出口 IP。
 */
export async function probeWebRtc(timeoutMs = 5000): Promise<WebRtcResult> {
  const empty: WebRtcResult = {
    supported: false,
    mdnsObscured: false,
    candidates: [],
    publicIps: [],
    privateIps: []
  }

  if (typeof RTCPeerConnection === 'undefined') {
    return { ...empty, error: '当前环境不支持 WebRTC' }
  }

  const pc = new RTCPeerConnection({ iceServers: [{ urls: STUN_SERVERS }] })
  const candidates: WebRtcCandidate[] = []

  try {
    pc.createDataChannel('netpurity')
    pc.onicecandidate = (e) => {
      if (!e.candidate?.candidate) return
      const parsed = parseCandidate(e.candidate.candidate)
      if (!parsed) return
      if (candidates.some((c) => c.address === parsed.address && c.type === parsed.type)) return
      candidates.push(parsed)
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer)
        pc.removeEventListener('icegatheringstatechange', onChange)
        resolve()
      }
      const onChange = () => {
        if (pc.iceGatheringState === 'complete') finish()
      }
      const timer = setTimeout(finish, timeoutMs)
      pc.addEventListener('icegatheringstatechange', onChange)
      onChange()
    })
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) }
  } finally {
    pc.close()
  }

  const mdnsObscured = candidates.some((c) => c.address.endsWith('.local'))
  const publicIps = [...new Set(
    candidates
      .filter((c) => (c.type === 'srflx' || c.type === 'relay') && !isPrivate(c.address) && !c.address.endsWith('.local'))
      .map((c) => c.address)
  )]
  const privateIps = [...new Set(
    candidates.filter((c) => c.type === 'host' && isPrivate(c.address)).map((c) => c.address)
  )]

  return { supported: true, mdnsObscured, candidates, publicIps, privateIps }
}
