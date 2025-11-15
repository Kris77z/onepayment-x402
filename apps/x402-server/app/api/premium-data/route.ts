import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET() {
  return NextResponse.json(
    {
      title: 'Premium Market Insights',
      timestamp: new Date().toISOString(),
      highlights: [
        '实时监控跨境订单结算状态',
        '智能提醒佣金 Payment Intent 最新进展',
        '汇总 Sandbox 账户余额与试算报表'
      ],
      tips: '若收到 402 响应，请完成支付或在 Result 页点击“Retry Commission Settlement”重试。',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

