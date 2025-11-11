'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '../../../components/ui/button';
import { Card, CardFooter, CardHeader } from '../../../components/ui/card';
import { getPaymentStatus, config, retryCommission } from '../../../lib/api-client';
import { formatCurrency } from '../../../lib/utils';

const REFRESH_INTERVAL = 3000;

export default function ResultPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const statusQuery = useQuery({
    queryKey: ['payment-status', sessionId],
    queryFn: () => getPaymentStatus(sessionId),
    refetchInterval: REFRESH_INTERVAL
  });

  const retryMutation = useMutation({
    mutationFn: () => retryCommission(sessionId),
    onSuccess: async () => {
      await statusQuery.refetch();
    }
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">支付结果</h1>
        <p className="text-sm text-slate-500">
          sessionId: <span className="font-mono text-slate-700">{sessionId}</span>
        </p>
      </section>

      <Card>
        <CardHeader title="状态" description="每 3 秒自动刷新，可随时点击按钮手动更新。" />
        {statusQuery.isLoading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : statusQuery.isError ? (
          <p className="text-sm text-red-600">
            {statusQuery.error instanceof Error
              ? statusQuery.error.message
              : '无法获取支付状态'}
          </p>
        ) : statusQuery.data ? (
          <StatusDetails
            status={statusQuery.data}
            sessionId={sessionId}
            onManualRefresh={() => statusQuery.refetch()}
            onRetry={() => retryMutation.mutate()}
            retryPending={retryMutation.isPending}
            retryError={
              retryMutation.isError && retryMutation.error instanceof Error
                ? retryMutation.error.message
                : retryMutation.isError
                ? '重试请求失败'
                : null
            }
            retrySuccess={retryMutation.isSuccess}
          />
        ) : null}
        <CardFooter className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Button variant="outline" onClick={() => statusQuery.refetch()}>
            手动刷新
          </Button>
          <Button asChild>
            <Link href="/dashboard">返回 Dashboard</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

function StatusDetails({
  status,
  sessionId,
  onManualRefresh,
  onRetry,
  retryPending,
  retryError,
  retrySuccess
}: {
  status: Awaited<ReturnType<typeof getPaymentStatus>>;
  sessionId: string;
  onManualRefresh: () => void;
  onRetry: () => void;
  retryPending: boolean;
  retryError: string | null;
  retrySuccess: boolean;
}) {
  const badgeColor =
    status.status === 'settled'
      ? 'bg-emerald-100 text-emerald-700'
      : status.status === 'failed'
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-700';

  return (
    <section className="space-y-3 text-sm text-slate-700">
      <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs ${badgeColor}`}>
        {status.status.toUpperCase()}
      </span>
      <div>
        <p className="text-xs text-slate-400">最后更新</p>
        <p>{new Date(status.updatedAt).toLocaleString()}</p>
      </div>
      <div>
        <p className="text-xs text-slate-400">会话有效期</p>
        <p>{new Date(status.expiresAt).toLocaleString()}</p>
      </div>
      {status.transactionSignature ? (
        <div>
          <p className="text-xs text-slate-400">链上签名</p>
          <p className="font-mono text-xs">{status.transactionSignature}</p>
        </div>
      ) : null}
      {status.failureReason ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{status.failureReason}</p>
      ) : null}
      {status.quote ? (
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Quote Snapshot</p>
          <p className="text-sm text-slate-600">
            {formatCurrency(status.quote.quotedAmountUsd)} @{' '}
            {status.quote.rate.toFixed(6)} （来源 {status.quote.rateSource}）
          </p>
          <p className="text-xs text-slate-400">
            Expires {new Date(status.quote.quoteExpiresAt).toLocaleString()} · Feed{' '}
            {status.quote.feedId}
          </p>
        </div>
      ) : null}
      {status.settlement ? (
        <SettlementSummary
          sessionId={sessionId}
          settlement={status.settlement}
          onRetry={onRetry}
          retryPending={retryPending}
          retryError={retryError}
          retrySuccess={retrySuccess}
          onManualRefresh={onManualRefresh}
        />
      ) : (
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          尚未记录结算摘要，佣金拆分将在付款完成后展示。
        </p>
      )}
      <p className="text-xs text-slate-400">
        Facilitator Endpoint: <span className="font-mono">{config.facilitatorUrl}</span>
      </p>
    </section>
  );
}

function SettlementSummary({
  sessionId,
  settlement,
  onRetry,
  retryPending,
  retryError,
  retrySuccess,
  onManualRefresh
}: {
  sessionId: string;
  settlement: Awaited<ReturnType<typeof getPaymentStatus>>['settlement'];
  onRetry: () => void;
  retryPending: boolean;
  retryError: string | null;
  retrySuccess: boolean;
  onManualRefresh: () => void;
}) {
  if (!settlement) {
    return null;
  }

  const commission = settlement.commissionTransfer;
  const totalUSD = settlement.totalAmount / 1_000_000;
  const commissionUSD = settlement.commissionAmount / 1_000_000;
  const netUSD = settlement.netAmount / 1_000_000;

  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">Settlement Snapshot</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <p className="text-xs text-slate-400">结算时间</p>
          <p>{new Date(settlement.settledAt).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">总金额 (USDC)</p>
          <p>{formatCurrency(totalUSD)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">佣金占比</p>
          <p>{(settlement.commissionBps / 100).toFixed(2)}%</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <p className="text-xs text-slate-400">佣金金额</p>
          <p>{formatCurrency(commissionUSD)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">商户实收</p>
          <p>{formatCurrency(netUSD)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">结算签名</p>
          <p className="truncate font-mono text-xs">
            {settlement.transactionSignature ?? 'N/A'}
          </p>
        </div>
      </div>

      {commission ? (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Commission Intent</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs text-slate-400">状态</p>
              <p className="font-medium text-slate-700">{commission.status.toUpperCase()}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">目标账户</p>
              <p className="font-mono text-xs">
                {commission.destination?.gridAccountId ?? 'N/A'}
              </p>
            </div>
          </div>
          {commission.intentSnapshot ? (
            <div className="rounded bg-white p-3 text-xs text-slate-600">
              <p>
                Intent ID: <span className="font-mono">{commission.intentSnapshot.id}</span>
              </p>
              <p>Status: {commission.intentSnapshot.status}</p>
              <p>
                Signers:{' '}
                {commission.intentSnapshot.transactionSigners.length > 0
                  ? commission.intentSnapshot.transactionSigners.join(', ')
                  : 'N/A'}
              </p>
              {commission.intentSnapshot.validUntil ? (
                <p>Valid Until: {commission.intentSnapshot.validUntil}</p>
              ) : null}
            </div>
          ) : null}
          {commission.attempts.length > 0 ? (
            <div className="space-y-2 text-xs text-slate-600">
              <p className="text-xs uppercase tracking-wide text-slate-400">Attempts</p>
              {commission.attempts.map((attempt) => (
                <div key={attempt.attemptId} className="rounded bg-white p-3 shadow-sm">
                  <p className="font-mono text-xs">{attempt.attemptId}</p>
                  <p>Status: {attempt.status}</p>
                  <p>Requested: {new Date(attempt.requestedAt).toLocaleString()}</p>
                  <p>
                    Completed:{' '}
                    {attempt.completedAt ? new Date(attempt.completedAt).toLocaleString() : 'N/A'}
                  </p>
                  <p>Signature: {attempt.solanaTxSignature ?? 'N/A'}</p>
                  {attempt.errorMessage ? <p>Error: {attempt.errorMessage}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
          <div className="rounded bg-white p-3 text-xs text-slate-600">
            <p className="text-xs uppercase tracking-wide text-slate-400">操作指引</p>
            <p>
              API Base: <span className="font-mono">{config.apiBaseUrl}</span>
            </p>
            <p>
              {commission.retryAvailable
                ? `可重试佣金 Intent： curl -X POST ${config.apiBaseUrl}/api/payments/${sessionId}/commission/retry`
                : '佣金 Intent 已完成，无需重试'}
            </p>
            <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
              <Button
                variant="outline"
                disabled={!commission.retryAvailable || retryPending}
                onClick={onRetry}
              >
                {retryPending ? '重试中…' : '重试佣金结算'}
              </Button>
              <Button variant="ghost" className="text-xs text-slate-500" onClick={onManualRefresh}>
                刷新状态
              </Button>
            </div>
            {retryError ? <p className="mt-2 text-xs text-red-600">{retryError}</p> : null}
            {retrySuccess && !retryError ? (
              <p className="mt-2 text-xs text-emerald-600">已发起佣金重试，等待状态更新…</p>
            ) : null}
            {commission.latestError ? (
              <p className="text-red-600">最新错误：{commission.latestError}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">
          尚未生成佣金 Payment Intent。
        </p>
      )}

      {settlement.settlementLog.length > 0 ? (
        <div className="space-y-1 text-xs text-slate-500">
          <p className="text-xs uppercase tracking-wide text-slate-400">Settlement Log</p>
          <ul className="space-y-1">
            {settlement.settlementLog.map((entry, index) => (
              <li key={`${entry.timestamp}-${index}`} className="rounded bg-white p-2">
                <span className="font-mono text-[10px] text-slate-400">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
                <p className="text-slate-600">
                  {entry.level ? `[${entry.level.toUpperCase()}] ` : ''}
                  {entry.message}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

