import { NextRequest, NextResponse } from 'next/server'
import countries from './lib/countries.json'

export const config = {
  matcher: '/',
}

type CountryMetadata = {
  cca2: string
  currencies?: Record<string, { name?: string; symbol?: string }>
  languages?: Record<string, string>
}

const GEO_QUERY_KEYS = [
  'country',
  'city',
  'region',
  'currencyCode',
  'currencySymbol',
  'name',
  'languages',
] as const

const GEO_REQUEST_HEADERS = {
  country: 'x-geo-country',
  city: 'x-geo-city',
  region: 'x-geo-region',
  currencyCode: 'x-geo-currency-code',
  currencySymbol: 'x-geo-currency-symbol',
  name: 'x-geo-currency-name',
  languages: 'x-geo-languages',
} as const

function decodeHeader(value: string | null) {
  if (!value) return ''

  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

export function proxy(req: NextRequest) {
  const url = req.nextUrl.clone()
  const requestedCountry = (req.headers.get('x-vercel-ip-country') || '')
    .trim()
    .toUpperCase()
  const countryInfo = countries.find(
    (item) => item.cca2 === requestedCountry
  ) as CountryMetadata | undefined

  const currencies = countryInfo?.currencies ?? {}
  const currencyCode = Object.keys(currencies)[0] ?? ''
  const currency = currencyCode ? currencies[currencyCode] : undefined
  const location = {
    country: countryInfo?.cca2 ?? '',
    city: decodeHeader(req.headers.get('x-vercel-ip-city')),
    region: (req.headers.get('x-vercel-ip-country-region') || '').trim(),
    currencyCode,
    currencySymbol: currency?.symbol ?? '',
    name: currency?.name ?? '',
    languages: Object.values(countryInfo?.languages ?? {}).join(', '),
  }

  for (const key of GEO_QUERY_KEYS) {
    url.searchParams.delete(key)
  }

  const requestHeaders = new Headers(req.headers)
  for (const headerName of Object.values(GEO_REQUEST_HEADERS)) {
    requestHeaders.delete(headerName)
  }
  for (const [key, value] of Object.entries(location)) {
    const headerName = GEO_REQUEST_HEADERS[key as keyof typeof GEO_REQUEST_HEADERS]
    if (value) requestHeaders.set(headerName, value)
  }

  const response = NextResponse.rewrite(url, {
    request: { headers: requestHeaders },
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
