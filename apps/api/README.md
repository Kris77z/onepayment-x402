# PayAgent API Service

> Express + TypeScript 服务骨架，负责统一暴露支付会话与 Grid 数据接口。

## 快速开始

```bash
cd apps/api
npm install
npm run dev
```

默认监听端口：`API_PORT`（未配置时为 4000）。

## 路由概览

- `GET /health`：应用健康检查
- `POST /api/payments/session`：创建支付会话（目前返回 501，待实现）
- `POST /api/payments/settle`：提交支付结算（目前返回 501）
- `GET /api/payments/:sessionId/status`：查询支付状态（目前返回 501）
- `GET /api/grid/:accountId/balances`：查询 Grid 账户余额（目前返回 501）
- `GET /api/grid/:accountId/transfers`：查询 Grid 转账记录（目前返回 501）

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `API_PORT` | HTTP 监听端口 | 4000 |
| `FACILITATOR_URL` | 代理调用的 Facilitator 基础地址 | - |
| `GRID_API_KEY` | Grid API Key（仅服务器内部使用） | - |
| `GRID_ENVIRONMENT` | `sandbox` / `production` | - |
| `REQUEST_TIMEOUT_MS` | 外部调用超时时间 | 30000 |

> 服务会自动向上查找根目录 `.env`。

## 下一步

- 接入 `apps/grid` 封装的服务以返回真实数据
- 实现支付会话的持久化与结算逻辑
- 增加错误码映射与结构化日志

