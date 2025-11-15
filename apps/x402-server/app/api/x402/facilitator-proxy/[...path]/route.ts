import { NextRequest, NextResponse } from 'next/server'

// 这个 API Route 运行在 Node.js runtime，可以访问本地网络
export const runtime = 'nodejs'

// 实际的 facilitator 地址（本地服务）
const REAL_FACILITATOR_URL = process.env.REAL_FACILITATOR_URL || 'http://127.0.0.1:3001'

async function proxyRequest(request: NextRequest, path: string) {
  try {
    // 构建完整的 facilitator URL
    const facilitatorUrl = `${REAL_FACILITATOR_URL}${path}`
    console.log(`[Facilitator Proxy] 代理 ${request.method} 请求到: ${facilitatorUrl}`)

    const body = request.method === 'POST' ? await request.text() : undefined

    const response = await fetch(facilitatorUrl, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        ...(body && { 'Content-Length': String(body.length) }),
      },
      body,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Facilitator Proxy] Facilitator 返回错误: ${response.status} ${response.statusText}`, errorText)
      return NextResponse.json(
        { error: `Facilitator 返回错误: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[Facilitator Proxy] 成功获取数据`)

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': path.includes('supported-payment-kinds') 
          ? 'public, max-age=60' 
          : 'no-cache',
      },
    })
  } catch (error) {
    console.error('[Facilitator Proxy] 代理请求失败:', error)
    return NextResponse.json(
      { error: `代理请求失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // 从动态路由参数中构建路径
  // 例如: /api/x402/facilitator-proxy/.well-known/x402/supported-payment-kinds
  // params.path = ['.well-known', 'x402', 'supported-payment-kinds']
  const { path: pathArray } = await params
  const path = '/' + pathArray.join('/')
  return proxyRequest(request, path)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // 从动态路由参数中构建路径
  // 例如: /api/x402/facilitator-proxy/verify
  // params.path = ['verify']
  const { path: pathArray } = await params
  const path = '/' + pathArray.join('/')
  return proxyRequest(request, path)
}

