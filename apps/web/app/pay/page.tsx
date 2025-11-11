'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardFooter, CardHeader } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import {
  createQuote,
  createSession,
  QuoteData,
  SessionData,
  config
} from '../../lib/api-client';
import { formatCurrency } from '../../lib/utils';

const MIN_AMOUNT_USDC = 0.01;

export default function PayPage() {
  const [amount, setAmount] = useState('10');
  const [validationError, setValidationError] = useState<string | null>(null);
  const quoteMutation = useMutation({ mutationFn: createQuote });
  const sessionMutation = useMutation({ mutationFn: createSession });

  const quote = quoteMutation.data;
  const session = sessionMutation.data;
  const hasQuote = Boolean(quote);

  async function handleQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number.parseFloat(amount);
    if (Number.isNaN(parsed) || parsed < MIN_AMOUNT_USDC) {
      setValidationError(`金额需大于等于 ${MIN_AMOUNT_USDC} USDC`);
      quoteMutation.reset();
      return;
    }
    setValidationError(null);
    const minorUnits = Math.round(parsed * 1_000_000);
    quoteMutation.reset();
    sessionMutation.reset();
    await quoteMutation.mutateAsync({ amount: minorUnits, currency: 'USDC' });
  }

  async function handleCreateSession(quoteData: QuoteData) {
    const payload = {
      amount: quoteData.inputAmount,
      currency: 'USDC' as const,
      quoteId: quoteData.quoteId
    };
    await sessionMutation.mutateAsync(payload);
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">创建支付流程</h1>
        <p className="text-sm text-slate-500">
          输入 USDC 金额 → 调用 Switchboard 汇率 → 创建支付会话。完成后即可前往 Result 页轮询
          `/status`。
        </p>
      </section>

      <Card>
        <CardHeader
          title="Step 1 · 获取报价"
          description="金额以 USDC 计价，系统会自动转换为 6 位小数的最小单位。"
        />
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleQuote}>
          <Input
            aria-label="USDC amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="例如 10.5"
            inputMode="decimal"
          />
          <Button type="submit" disabled={quoteMutation.isPending}>
            {quoteMutation.isPending ? 'Fetching...' : '获取报价'}
          </Button>
        </form>
        {quoteMutation.isError ? (
          <p className="mt-3 text-sm text-red-600">
            {quoteMutation.error instanceof Error
              ? quoteMutation.error.message
              : '无法获取报价'}
          </p>
        ) : null}
        {validationError ? (
          <p className="mt-3 text-sm text-red-600">{validationError}</p>
        ) : null}
        {hasQuote ? <QuoteSummary quote={quote!} /> : null}
        {hasQuote ? (
          <CardFooter>
            <Button
              onClick={() => handleCreateSession(quote!)}
              disabled={sessionMutation.isPending}
            >
              {sessionMutation.isPending ? '创建中…' : '创建支付会话'}
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      {session ? <SessionSummary session={session} /> : null}
    </main>
  );
}

function QuoteSummary({ quote }: { quote: QuoteData }) {
  return (
    <section className="mt-4 space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
      <h2 className="font-medium text-slate-900">报价详情</h2>
      <p className="text-slate-600">
        兑换率 {quote.rate.toFixed(6)}，相当于{' '}
        <strong>{formatCurrency(quote.quotedAmountUsd)}</strong>。报价来源：
        <span className="ml-1 inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs uppercase tracking-wide">
          {quote.rateSource}
        </span>
      </p>
      <p className="text-xs text-slate-500">
        Quote ID: {quote.quoteId} · 有效期至 {new Date(quote.quoteExpiresAt).toLocaleString()}
      </p>
    </section>
  );
}

function SessionSummary({ session }: { session: SessionData }) {
  return (
    <Card>
      <CardHeader
        title="Step 2 · 会话已创建"
        description="将 `sessionId` 交给客户端签名流程。完成后可前往结果页面查看状态。"
      />
      <dl className="space-y-3 text-sm text-slate-700">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Session ID</dt>
          <dd className="font-mono">{session.sessionId}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">
            Facilitator Endpoint
          </dt>
          <dd className="font-mono">{session.facilitatorUrl || config.facilitatorUrl}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Merchant Address</dt>
          <dd className="font-mono">{session.merchantAddress}</dd>
        </div>
        {session.quote ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Session Quote</dt>
            <dd>
              {formatCurrency(session.quote.quotedAmountUsd)} @ {session.quote.rate.toFixed(6)} (
              expires {new Date(session.quote.quoteExpiresAt).toLocaleString()})
            </dd>
          </div>
        ) : null}
      </dl>
      <CardFooter className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Button variant="outline" asChild>
          <Link href={`/result/${session.sessionId}`}>查看结果页</Link>
        </Button>
        <p className="text-xs text-slate-500">
          将客户端签名包发送至 Facilitator `{session.facilitatorUrl}` 后，结果页会显示结算状态。
        </p>
      </CardFooter>
    </Card>
  );
}

