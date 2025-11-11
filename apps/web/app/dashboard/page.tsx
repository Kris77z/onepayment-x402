import Link from 'next/link';
import { config } from '../../lib/api-client';
import { Card, CardFooter, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

const items: Array<{ label: string; value: string }> = [
  { label: 'API Base URL', value: config.apiBaseUrl },
  { label: 'Facilitator URL', value: config.facilitatorUrl },
  { label: 'Default Rate Source', value: config.rateSource }
];

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-slate-900">Operations Dashboard</h1>
        <p className="text-sm text-slate-500">
          监控 Switchboard 报价与 Grid 结算状态。使用下方入口快速跳转到支付流程与结果页。
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="连接信息" description="当前环境的关键端点与默认配置" />
          <ul className="space-y-3 text-sm text-slate-600">
            {items.map((item) => (
              <li key={item.label}>
                <span className="block text-xs uppercase tracking-wide text-slate-400">
                  {item.label}
                </span>
                <span className="font-medium text-slate-900">{item.value}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="工作流入口"
            description="Day 2 重点是汇率报价、支付会话与对账联动。"
          />
          <div className="flex flex-col gap-3 text-sm text-slate-600">
            <Link className="font-medium text-brand" href="/pay">
              发起新的支付流程 &rarr;
            </Link>
            <Link className="font-medium text-brand" href="/result/example">
              查看示例结果页 &rarr;
            </Link>
          </div>
          <CardFooter>
            <Button asChild>
              <Link href="/pay">开始支付演练</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/result/example">查看状态</Link>
            </Button>
          </CardFooter>
        </Card>
      </section>
    </main>
  );
}

