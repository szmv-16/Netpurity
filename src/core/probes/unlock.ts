/**
 * 解锁 / 可达性测试。
 *
 * 注意：这里没有各平台的官方接口，判定靠的是「HTTP 状态码 + 页面里的地区限制文案」，
 * 属于经验型启发式，会有误判（登录墙、Cloudflare 人机验证、A/B 页面都会干扰）。
 * UI 上必须标注为实验性，并且把状态码一起展示出来，让用户自己能判断。
 */

export type UnlockState = 'ok' | 'blocked' | 'unreachable' | 'unknown'

export interface UnlockService {
  id: string
  name: string
  group: '流媒体' | 'AI' | '其他'
  url: string
  /** 页面里出现这些文案就判定为地区受限 */
  blockedMarkers: string[]
  /** 出现这些文案说明可用 */
  okMarkers?: string[]
  note: string
}

export interface UnlockResult {
  id: string
  name: string
  state: UnlockState
  detail: string
  status?: number
  ms: number
}

const GEO_MARKERS = [
  'not available in your country',
  'not available in your region',
  "isn't available in your region",
  "isn't available in your country",
  'is not available in your country',
  'is not available in your region',
  'unavailable in your country',
  'not yet available in your country',
  'we are not available in your region',
  '不在你所在的国家',
  '不在您所在的国家',
  '该内容不支持当前地区',
  '抱歉您所在地区不可观看'
]

export const UNLOCK_SERVICES: UnlockService[] = [
  {
    id: 'netflix',
    name: 'Netflix',
    group: '流媒体',
    url: 'https://www.netflix.com/title/81215567',
    blockedMarkers: GEO_MARKERS,
    note: '用一部 Netflix 原创剧的详情页试探，受限地区通常返回「不可用」页面'
  },
  {
    id: 'disney',
    name: 'Disney+',
    group: '流媒体',
    url: 'https://www.disneyplus.com/',
    blockedMarkers: GEO_MARKERS,
    note: '检测首页是否返回地区限制页'
  },
  {
    id: 'primevideo',
    name: 'Prime Video',
    group: '流媒体',
    url: 'https://www.primevideo.com/',
    blockedMarkers: GEO_MARKERS,
    note: '检测首页是否返回地区限制页'
  },
  {
    id: 'youtube-premium',
    name: 'YouTube Premium',
    group: '流媒体',
    url: 'https://www.youtube.com/premium',
    blockedMarkers: [...GEO_MARKERS, 'premium is not available'],
    note: '检测 Premium 介绍页是否提示当前地区不可用'
  },
  {
    id: 'spotify',
    name: 'Spotify',
    group: '流媒体',
    url: 'https://www.spotify.com/premium/',
    blockedMarkers: [...GEO_MARKERS, 'spotify is not available in your country'],
    note: '检测 Premium 页的地区可用性'
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    group: '流媒体',
    url: 'https://www.tiktok.com/',
    blockedMarkers: [...GEO_MARKERS, 'couldn\'t find this account'],
    note: '检测首页可达性与地区提示'
  },
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    group: '流媒体',
    url: 'https://www.bilibili.com/',
    blockedMarkers: [],
    note: '只判断可达性；港澳台 / 大陆的内容差异需要登录后看具体番剧'
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    group: 'AI',
    url: 'https://chatgpt.com/',
    blockedMarkers: [...GEO_MARKERS, 'unsupported_country'],
    note: '受限地区会返回 403 与地区提示页'
  },
  {
    id: 'claude',
    name: 'Claude',
    group: 'AI',
    url: 'https://claude.ai/',
    blockedMarkers: [...GEO_MARKERS, 'not available in your region'],
    note: '受限地区会返回 403'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    group: 'AI',
    url: 'https://gemini.google.com/',
    blockedMarkers: GEO_MARKERS,
    note: '受限地区通常会跳转到支持页并提示不可用'
  }
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export async function probeUnlock(service: UnlockService, timeoutMs = 12000): Promise<UnlockResult> {
  const started = Date.now()
  try {
    const res = await fetch(service.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': UA,
        'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8',
        accept: 'text/html,application/xhtml+xml'
      }
    })

    // 只读前 300KB，避免整页拉完
    const text = (await res.text()).slice(0, 300_000).toLowerCase()
    const hit = service.blockedMarkers.find((m) => text.includes(m.toLowerCase()))
    const ms = Date.now() - started

    if (hit) {
      return {
        id: service.id,
        name: service.name,
        state: 'blocked',
        detail: `页面提示地区受限（命中「${hit.slice(0, 40)}」）`,
        status: res.status,
        ms
      }
    }

    if (res.status === 403 || res.status === 451) {
      return {
        id: service.id,
        name: service.name,
        state: 'unknown',
        detail: `返回 ${res.status}，可能是地区限制，也可能是人机验证，需人工确认`,
        status: res.status,
        ms
      }
    }

    if (res.status >= 200 && res.status < 400) {
      return {
        id: service.id,
        name: service.name,
        state: 'ok',
        detail: `HTTP ${res.status}，页面正常返回，未发现地区限制提示`,
        status: res.status,
        ms
      }
    }

    return {
      id: service.id,
      name: service.name,
      state: 'unknown',
      detail: `HTTP ${res.status}，无法判定`,
      status: res.status,
      ms
    }
  } catch (err) {
    const ms = Date.now() - started
    const name = (err as Error)?.name ?? ''
    const message =
      name === 'TimeoutError' || name === 'AbortError'
        ? '请求超时'
        : /ENOTFOUND|EAI_AGAIN/.test(String(err))
          ? 'DNS 解析失败'
          : '连接失败（被阻断或网络不可达）'
    return {
      id: service.id,
      name: service.name,
      state: 'unreachable',
      detail: message,
      ms
    }
  }
}

export async function probeAllUnlock(
  onProgress?: (r: UnlockResult) => void,
  concurrency = 5
): Promise<UnlockResult[]> {
  const results: UnlockResult[] = []
  const queue = [...UNLOCK_SERVICES]

  async function worker(): Promise<void> {
    for (;;) {
      const next = queue.shift()
      if (!next) return
      const r = await probeUnlock(next)
      results.push(r)
      onProgress?.(r)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()))
  // 按原始顺序返回，界面布局才稳定
  return UNLOCK_SERVICES.map((s) => results.find((r) => r.id === s.id)).filter(Boolean) as UnlockResult[]
}
