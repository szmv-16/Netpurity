import type { IpClass } from '../types.ts'

/**
 * 机房 / 云厂商 / VPN 常见 ASN。
 * 只收录公开可查的知名网络，用于离线兜底判断——线上情报 API 不可用时也能给出类型结论。
 */
export const HOSTING_ASNS: Record<number, string> = {
  14061: 'DigitalOcean',
  16509: 'Amazon AWS',
  14618: 'Amazon AWS',
  8987: 'Amazon AWS',
  13335: 'Cloudflare',
  209242: 'Cloudflare',
  15169: 'Google',
  396982: 'Google Cloud',
  8075: 'Microsoft',
  8068: 'Microsoft',
  20940: 'Akamai',
  16625: 'Akamai',
  63949: 'Akamai / Linode',
  16276: 'OVH',
  24940: 'Hetzner',
  20473: 'Vultr / Choopa',
  51167: 'Contabo',
  12876: 'Scaleway',
  9009: 'M247',
  202425: 'IP Volume',
  62240: 'Clouvider',
  49505: 'Selectel',
  36352: 'ColoCrossing',
  53667: 'FranTech / BuyVM',
  40676: 'Psychz',
  29802: 'Hivelocity',
  46844: 'Sharktech',
  60068: 'Datacamp / CDN77',
  212238: 'Datacamp / CDN77',
  21859: 'Zenlayer',
  45102: 'Alibaba Cloud',
  37963: 'Alibaba Cloud',
  132203: 'Tencent Cloud',
  45090: 'Tencent Cloud',
  55990: 'Huawei Cloud',
  136907: 'Huawei Cloud',
  136787: 'PacketHub (VPN)',
  63023: 'GSL Networks',
  53755: 'IONOS',
  8560: 'IONOS',
  34011: 'Hostinger',
  47583: 'Hostinger',
  26496: 'GoDaddy',
  32244: 'Liquid Web',
  19871: 'Network Solutions',
  46606: 'Unified Layer',
  26347: 'New Dream',
  3223: 'Voxel',
  55293: 'A2 Hosting',
  22612: 'Namecheap',
  35916: 'Namecheap',
  398101: 'GoDaddy',
  134963: 'Alibaba',
  58879: 'Sharktech',
  205544: 'Zenlayer',
  13414: 'Twitter',
  32934: 'Meta',
  2906: 'Netflix'
}

/** 名称里出现这些词，基本可以判定为机房或代理设施 */
export const HOSTING_NAME_RE =
  /\b(vpn|proxy|proxies|hosting|host|server|servers|cloud|datacenter|data\s?center|colo|colocation|dedicated|vps|virtual\s?private|bulletproof|seedbox|cdn|edgecast|compute|instance)\b/i

/** 名称里出现这些词，更像真实住宅 / 移动网络 */
export const RESIDENTIAL_NAME_RE =
  /\b(comcast|verizon|at&t|charter|spectrum|cox|centurylink|frontier|windstream|mediacom|optimum|suddenlink|bt|vodafone|orange|telefonica|deutsche\s?telekom|t-mobile|kddi|softbank|ntt|docomo|pccw|hkt|hkbn|netvigator|i-cable|hgc|singtel|starhub|telstra|optus|rogers|bell|telus|shaw|biglobe|so-net|proximus|kpn|ziggo|telenet|swisscom|elisa|telia|broadband|fiber|fibre|telecom|communications|cable|dsl|isp|internet\s?service)\b/i

export const MOBILE_NAME_RE = /\b(mobile|cellular|wireless|4g|5g|lte|gsm|umts)\b/i

/** 知名的公共 DNS 递归解析器，用于识别“公共 DNS 而非本地 ISP DNS”的情况 */
export const PUBLIC_DNS: { ip: string; name: string; asn?: number }[] = [
  { ip: '8.8.8.8', name: 'Google Public DNS', asn: 15169 },
  { ip: '8.8.4.4', name: 'Google Public DNS', asn: 15169 },
  { ip: '1.1.1.1', name: 'Cloudflare DNS', asn: 13335 },
  { ip: '1.0.0.1', name: 'Cloudflare DNS', asn: 13335 },
  { ip: '9.9.9.9', name: 'Quad9', asn: 19281 },
  { ip: '149.112.112.112', name: 'Quad9', asn: 19281 },
  { ip: '208.67.222.222', name: 'Cisco OpenDNS', asn: 36692 },
  { ip: '208.67.220.220', name: 'Cisco OpenDNS', asn: 36692 },
  { ip: '94.140.14.14', name: 'AdGuard DNS', asn: 212772 },
  { ip: '94.140.15.15', name: 'AdGuard DNS', asn: 212772 },
  { ip: '77.88.8.8', name: 'Yandex DNS', asn: 13238 },
  { ip: '223.5.5.5', name: 'AliDNS', asn: 37963 },
  { ip: '223.6.6.6', name: 'AliDNS', asn: 37963 },
  { ip: '119.29.29.29', name: 'DNSPod / Tencent', asn: 132203 },
  { ip: '114.114.114.114', name: '114DNS', asn: 4134 },
  { ip: '180.76.76.76', name: 'Baidu DNS', asn: 55990 }
]

export function normalizeAsn(asn?: string): number | undefined {
  if (!asn) return undefined
  const digits = asn.replace(/[^0-9]/g, '')
  return digits ? Number(digits) : undefined
}

export function isPublicDns(ip: string, org?: string): boolean {
  if (PUBLIC_DNS.some((d) => d.ip === ip)) return true
  if (!org) return false
  return /cloudflare|google|quad9|opendns|cisco|adguard|yandex/i.test(org)
}

/**
 * 综合 ASN、组织名、情报标记判定 IP 类型。
 * 判定顺序：明确的代理标记 > 机房 ASN > 移动网络 > 名称特征 > 未知。
 */
export function classifyIp(opts: {
  asn?: string
  asName?: string
  org?: string
  isp?: string
  isProxy: boolean
  isHosting: boolean
  isMobile: boolean
}): { ipClass: IpClass; reason: string } {
  const asnNum = normalizeAsn(opts.asn)
  const name = [opts.asName, opts.org, opts.isp].filter(Boolean).join(' | ')

  if (opts.isProxy) return { ipClass: 'vpn', reason: '情报源标记为代理 / VPN / Tor 出口' }

  if (asnNum && HOSTING_ASNS[asnNum]) {
    return { ipClass: 'datacenter', reason: `ASN ${asnNum} 属于机房 / 云厂商（${HOSTING_ASNS[asnNum]}）` }
  }

  if (opts.isHosting) return { ipClass: 'datacenter', reason: '情报源标记为托管 / 数据中心网络' }
  if (opts.isMobile) return { ipClass: 'mobile', reason: '情报源标记为移动网络' }

  if (HOSTING_NAME_RE.test(name)) return { ipClass: 'datacenter', reason: `网络名称包含机房 / 代理特征：${name}` }
  if (MOBILE_NAME_RE.test(name)) return { ipClass: 'mobile', reason: `网络名称包含移动网络特征：${name}` }
  if (RESIDENTIAL_NAME_RE.test(name)) return { ipClass: 'residential', reason: `网络名称符合住宅宽带特征：${name}` }

  return { ipClass: 'unknown', reason: name ? `无法从网络中判定类型：${name}` : '缺少足够信息判定类型' }
}
