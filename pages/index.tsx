import type { GetServerSideProps } from 'next'
import Image from 'next/image'
import map from '../public/map.svg'

type GeoProps = {
  name: string
  languages: string
  city: string
  region: string
  country: string
  currencyCode: string
  currencySymbol: string
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function countryCodeToFlagEmoji(countryCode: string) {
  const code = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return '🌐'
  return String.fromCodePoint(...code.split('').map((char) => 127397 + char.charCodeAt(0)))
}

export const getServerSideProps: GetServerSideProps<GeoProps> = async ({ req, res }) => {
  res.setHeader('Cache-Control', 'private, no-store')

  return {
    props: {
      name: headerValue(req.headers['x-geo-currency-name']),
      languages: headerValue(req.headers['x-geo-languages']),
      city: headerValue(req.headers['x-geo-city']),
      region: headerValue(req.headers['x-geo-region']),
      country: headerValue(req.headers['x-geo-country']),
      currencyCode: headerValue(req.headers['x-geo-currency-code']),
      currencySymbol: headerValue(req.headers['x-geo-currency-symbol']),
    },
  }
}

export default function Index({
  name,
  languages,
  city,
  region,
  country,
  currencyCode,
  currencySymbol,
}: GeoProps) {
  const hasLocation = Boolean(country && city)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 py-2">
      <div className="fixed inset-0 overflow-hidden bg-[#f8fafb] opacity-75">
        <Image
          alt="World Map"
          src={map}
          fill
          sizes="100vw"
          style={{ objectFit: 'cover' }}
          quality={100}
          priority
        />
      </div>
      <main className="z-10 flex w-full flex-1 flex-col items-center px-4 pt-8 text-center sm:px-20 sm:pt-20">
        <h1 className="text-3xl font-bold sm:text-5xl">Geolocation</h1>
        <p className="mt-4 text-lg text-gray-700 sm:text-xl">
          Show localized content based on Vercel request headers
        </p>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Location is approximate and may be unavailable when the hosting provider does not supply geolocation headers.
        </p>
        <a
          className="mt-4 flex items-center rounded text-base text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 sm:text-lg"
          href="https://vercel.com/docs/edge-network/headers#request-headers?utm_source=geo-ip-demo&utm_campaign=geo-ip-demo"
          target="_blank"
          rel="noreferrer"
        >
          View Documentation
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            stroke="currentColor"
            className="ml-1"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            shapeRendering="geometricPrecision"
          >
            <path d="M5 12h14" />
            <path d="M12 5l7 7-7 7" />
          </svg>
        </a>

        {!hasLocation ? (
          <section
            className="mt-16 w-full max-w-2xl rounded-lg border border-gray-300 bg-white p-6 text-left shadow-lg"
            role="status"
          >
            <h2 className="text-xl font-semibold">Location unavailable</h2>
            <p className="mt-2 text-gray-700">
              This request did not include enough edge geolocation information. No default city or country has been substituted.
            </p>
          </section>
        ) : (
          <section className="mt-16 w-full max-w-2xl rounded-lg border border-gray-300 bg-white shadow-lg transition hover:shadow-2xl">
            <div className="flex items-center border-b p-4">
              <span
                role="img"
                aria-label={`${country} flag`}
                className="text-3xl leading-none"
              >
                {countryCodeToFlagEmoji(country)}
              </span>
              <div className="ml-4 mr-auto text-left">
                <h2 className="font-semibold">{name || country}</h2>
                <p className="text-gray-700">{city}</p>
              </div>
              <p className="self-center text-gray-700">{country}</p>
            </div>
            <div className="flex items-center gap-4 border-b bg-gray-50 p-4">
              <h3 className="mr-auto text-left font-semibold">Languages</h3>
              <p className="text-gray-700">{languages || 'Unavailable'}</p>
            </div>
            <div className="flex items-center gap-4 border-b bg-gray-50 p-4">
              <h3 className="mr-auto text-left font-semibold">Currency</h3>
              <p className="text-gray-700">
                {[currencyCode, currencySymbol].filter(Boolean).join(' ') || 'Unavailable'}
              </p>
            </div>
            <div className="rounded-b-lg bg-gray-50 p-4">
              <h3 className="text-left font-semibold">Geolocation Headers</h3>
              <dl className="mt-4 overflow-x-auto rounded-lg bg-black px-4 py-2 text-left font-mono text-sm leading-6 text-white">
                <div>
                  <dt className="inline font-semibold">x-vercel-ip-city: </dt>
                  <dd className="inline">{city}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">x-vercel-ip-country-region: </dt>
                  <dd className="inline">{region || 'Unavailable'}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">x-vercel-ip-country: </dt>
                  <dd className="inline">{country}</dd>
                </div>
              </dl>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
