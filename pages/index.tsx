import Image from 'next/image'
import map from '../public/map.svg'
import { Layout } from '@vercel/examples-ui'

type GeoProps = {
  name?: string
  languages?: string
  city?: string
  region?: string
  country?: string
  currencyCode?: string
  currencySymbol?: string
}

export const getServerSideProps = ({ query }) => ({
  props: {
    name: typeof query.name === 'string' ? query.name : '',
    languages: typeof query.languages === 'string' ? query.languages : '',
    city: typeof query.city === 'string' ? query.city : '',
    region: typeof query.region === 'string' ? query.region : '',
    country: typeof query.country === 'string' ? query.country : '',
    currencyCode:
      typeof query.currencyCode === 'string' ? query.currencyCode : '',
    currencySymbol:
      typeof query.currencySymbol === 'string' ? query.currencySymbol : '',
  },
})

export default function Index({
  name = '',
  languages = '',
  city = '',
  region = '',
  country = '',
  currencyCode = '',
  currencySymbol = '',
}: GeoProps) {
  const hasLocation = Boolean(country && city)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2 bg-gray-50">
      <div className="fixed inset-0 overflow-hidden opacity-75 bg-[#f8fafb]">
        <Image
          alt="World Map"
          src={map}
          layout="fill"
          objectFit="cover"
          quality={100}
        />
      </div>
      <main className="flex flex-col items-center flex-1 px-4 sm:px-20 text-center z-10 pt-8 sm:pt-20">
        <h1 className="text-3xl sm:text-5xl font-bold">Geolocation</h1>
        <p className="mt-4 text-lg sm:text-xl text-gray-700">
          Show localized content based on Vercel request headers
        </p>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Location is approximate and may be unavailable when the hosting provider does not supply geolocation headers.
        </p>
        <a
          className="flex items-center mt-4 text-md sm:text-lg text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 rounded"
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
            className="border border-gray-300 bg-white rounded-lg shadow-lg mt-16 w-full max-w-2xl p-6 text-left"
            role="status"
          >
            <h2 className="text-xl font-semibold">Location unavailable</h2>
            <p className="mt-2 text-gray-700">
              This request did not include enough edge geolocation information. No default city or country has been substituted.
            </p>
          </section>
        ) : (
          <section className="border border-gray-300 bg-white rounded-lg shadow-lg mt-16 w-full max-w-2xl hover:shadow-2xl transition">
            <div className="p-4 flex items-center border-b">
              <div className="self-center">
                <Image
                  alt={`${country} flag`}
                  className="rounded-full"
                  src={`https://flagcdn.com/96x72/${country.toLowerCase()}.png`}
                  width={32}
                  height={32}
                />
              </div>
              <div className="ml-4 mr-auto text-left">
                <h2 className="font-semibold">{name || country}</h2>
                <p className="text-gray-700">{city}</p>
              </div>
              <p className="self-center text-gray-700">{country}</p>
            </div>
            <div className="p-4 flex items-center border-b bg-gray-50 gap-4">
              <h3 className="font-semibold text-left mr-auto">Languages</h3>
              <p className="text-gray-700">{languages || 'Unavailable'}</p>
            </div>
            <div className="p-4 flex items-center border-b bg-gray-50 gap-4">
              <h3 className="font-semibold text-left mr-auto">Currency</h3>
              <p className="text-gray-700">
                {[currencyCode, currencySymbol].filter(Boolean).join(' ') || 'Unavailable'}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-b-lg">
              <h3 className="font-semibold text-left">Geolocation Headers</h3>
              <dl className="bg-black text-white font-mono text-left py-2 px-4 rounded-lg mt-4 text-sm leading-6 overflow-x-auto">
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

Index.Layout = Layout
