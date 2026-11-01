import { promises as dns } from 'node:dns'
import { getJson, settle } from '../http.ts'
import { classifyIp, normalizeAsn } from '../data/ip-class.ts'
import type { IpIntel } from '../types.ts'

interface IpWhoResponse {
  success?: boolean
  ip?: string
  country?: string
  country_code?: string
  region?: string
  city?: string
  connection?: { asn?: number; org?: string; isp?: string; domain?: string }
  timezone?: { id?: string }
}

interface IpApiResponse {
  status?: string
  message?: string
  country?: string
  countryCode?: string
  regionName?: string
  city?: string
  timezone?: string
  isp?: string
  org?: string
  as?: string
  asname?: string
  mobile?: boolean
  proxy?: boolean
  hosting?: boolean
}

interface IpApiCoResponse {
  country_name?: string
  country_code?: string
  region?: string
  city?: string
  timezone?: string
  org?: string
  asn?: string
}

async function reverseLookup(ip: string): Promise<string | undefined> {
  try {
    const names = await dns.reverse(ip)
    return names[0]
  } catch {
    return undefined
  }
}

/**
 * 聚合多个免费情报源。没有付费 API，靠 ipwho.is（地理/ASN）
 * + ip-api.com（代理/托管/移动标记）+ ipapi.co（兜底）。
 */
export async function lookupIp(ip: string): Promise<IpIntel> {
  const [lookups, ptr] = await Promise.all([
    settle<unknown>([
      {
        key: 'ipwho.is',
        run: () => getJson<IpWhoResponse>(`https://ipwho.is/${encodeURIComponent(ip)}`, 7000)
      },
      {
        key: 'ip-api.com',
        run: () =>
          getJson<IpApiResponse>(
            `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,regionName,city,timezone,isp,org,as,asname,mobile,proxy,hosting`,
            6000
          )
      }
    ]),
    reverseLookup(ip)
  ])

  const whoRes = lookups.find((r) => r.key === 'ipwho.is')
  const apiRes = lookups.find((r) => r.key === 'ip-api.com')

  const w = (whoRes?.value ?? {}) as IpWhoResponse
  const a = (apiRes?.value ?? {}) as IpApiResponse

  let country = w.country ?? a.country
  let countryCode = w.country_code ?? a.countryCode
  let region = w.region ?? a.regionName
  let city = w.city ?? a.city
  let timezone = w.timezone?.id ?? a.timezone
  let isp = w.connection?.isp ?? a.isp
  let org = w.connection?.org ?? a.org
  let asn = w.connection?.asn ? `AS${w.connection.asn}` : a.as?.match(/AS\d+/)?.[0]

  // 两个源都失败时用 ipapi.co 兜底
  if (!country && !asn) {
    try {
      const c = await getJson<IpApiCoResponse>(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, 7000)
      country = c.country_name
      countryCode = c.country_code
      region = c.region
      city = c.city
      timezone = c.timezone
      org = c.org
      asn = c.asn
    } catch {
      /* 兜底失败也不阻塞流程 */
    }
  }

  const isProxy = Boolean(a.proxy)
  const isHosting = Boolean(a.hosting)
  const isMobile = Boolean(a.mobile)
  const { ipClass, reason } = classifyIp({ asn, asName: a.asname, org, isp, isProxy, isHosting, isMobile })

  return {
    ip,
    country,
    countryCode,
    region,
    city,
    timezone,
    isp,
    org,
    asn,
    asName: a.asname,
    isMobile,
    isProxy,
    isHosting,
    ptr,
    ipClass,
    classReason: reason,
    sources: {
      'ipwho.is': whoRes?.value ?? { error: whoRes?.error },
      'ip-api.com': apiRes?.value ?? { error: apiRes?.error }
    }
  }
}

/** 轻量查询：只要归属，用于解析器 IP 的判定 */
export async function lookupOrg(
  ip: string
): Promise<{ country?: string; countryCode?: string; org?: string; asn?: number }> {
  try {
    const w = await getJson<IpWhoResponse>(`https://ipwho.is/${encodeURIComponent(ip)}`, 6000)
    return {
      country: w.country,
      countryCode: w.country_code,
      org: w.connection?.org ?? w.connection?.isp,
      asn: w.connection?.asn ?? normalizeAsn(undefined)
    }
  } catch {
    return {}
  }
}
