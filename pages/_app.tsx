import type { AppProps } from 'next/app'
import Head from 'next/head'
import '../styles/globals.css'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Geolocation Header Demo</title>
        <meta
          name="description"
          content="Inspect coarse Vercel geolocation headers with explicit unavailable states."
        />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
