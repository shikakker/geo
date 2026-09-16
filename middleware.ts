import { NextRequest, NextResponse } from 'next/server'
import countries from './lib/countries.json'

export const config = {
  matcher: '/',
}

function decodeHeader(value: string | null, fallback: string) {
  if (!value) return fallback

  try {
    return decodeURIComponent(value)
  } catch {
    return fallback
  }
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone()
  const fallbackCountry = countries.find((item) => item.cca2 === 'US')!
  const requestedCountry = (req.headers.get('x-vercel-ip-country') || 'US')
    .trim()
    .toUpperCase()
  const countryInfo =
    countries.find((item) => item.cca2 === requestedCountry) ?? fallbackCountry
  const country = countryInfo.cca2
  const city = decodeHeader(req.headers.get('x-vercel-ip-city'), 'San Francisco')
  const region = req.headers.get('x-vercel-ip-country-region') || 'CA'

  const currencyCode = Object.keys(countryInfo.currencies)[0]
  const currency = countryInfo.currencies[currencyCode]
  const languages = Object.values(countryInfo.languages).join(', ')

  url.searchParams.set('country', country)
  url.searchParams.set('city', city)
  url.searchParams.set('region', region)
  url.searchParams.set('currencyCode', currencyCode)
  url.searchParams.set('currencySymbol', currency.symbol)
  url.searchParams.set('name', currency.name)
  url.searchParams.set('languages', languages)

  return NextResponse.rewrite(url)
}
