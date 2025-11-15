import { Address } from 'viem'
import { paymentMiddleware, Resource, Network } from 'x402-next'
import { NextRequest } from 'next/server'

const address = process.env.NEXT_PUBLIC_RECEIVER_ADDRESS as Address
const network = process.env.NEXT_PUBLIC_NETWORK as Network
const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL as Resource
const cdpClientKey = process.env.NEXT_PUBLIC_CDP_CLIENT_KEY as string

const x402PaymentMiddleware = paymentMiddleware(
  address,
  {
    '/content/cheap': {
      price: '$0.01',
      config: {
        description: 'Access to cheap content',
      },
      network,
    },
    '/content/expensive': {
      price: '$0.25',
      config: {
        description: 'Access to expensive content',
      },
      network,
    },
    '/api/premium-data': {
      price: '$0.05',
      config: {
        description: 'Sandbox premium API data',
      },
      network,
    },
  },
  {
    url: facilitatorUrl,
  },
  {
    cdpClientKey,
    appLogo: '/logos/x402-examples.png',
    appName: 'x402 Demo',
    sessionTokenEndpoint: '/api/x402/session-token',
  },
)

export const middleware = (req: NextRequest) => {
  console.log('🔵 Middleware called:', {
    url: req.url,
    method: req.method,
    pathname: req.nextUrl.pathname,
    facilitatorUrl,
    timestamp: new Date().toISOString(),
  })

  const delegate = x402PaymentMiddleware as unknown as (
    request: NextRequest,
  ) => ReturnType<typeof x402PaymentMiddleware>

  const response = delegate(req)

  console.log('🟢 Middleware response:', {
    pathname: req.nextUrl.pathname,
    hasResponse: !!response,
  })

  return response
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (metadata files)
     * - api/x402/facilitator-proxy (proxy endpoint, skip middleware)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/x402/facilitator-proxy).*)',
    '/', // Include the root path explicitly
  ],
}
