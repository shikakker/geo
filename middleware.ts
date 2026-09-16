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

function decodeHeader(value: string | null) {
  if (!value) return ''

  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

export async function middleware(req: NextRequest) {
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

  for (const [key, value] of Object.entries(location)) {
    if (value) url.searchParams.set(key, value)
  }

  const response = NextResponse.rewrite(url)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
