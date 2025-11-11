# Grid Service Module

> 封装 Grid SDK 的轻量 TypeScript 模块，用于 Day 1 验证账户创建、地址查询、余额监控与支出限额配置。

## 快速开始

```bash
cd apps/grid
npm install
# 查看可用命令
npm run dev -- help
```

## 常用命令

```bash
# 使用既有 signer 公钥创建 Grid 账户
npm run dev -- accounts:create-signer <BASE58_PUBLIC_KEY>

# 获取账户地址（默认返回 Solana 地址）
npm run dev -- accounts:addresses <ACCOUNT_ID> --chain=solana

# 查询余额与最近转账
npm run dev -- accounts:balances <ACCOUNT_ID>
npm run dev -- accounts:transfers <ACCOUNT_ID> --limit=5

# 按交易签名查询单笔转账详情
npm run dev -- accounts:transfers:by-signature <ACCOUNT_ID> <SOLANA_SIGNATURE>

# 创建一次性 USDC 支出限额
npm run dev -- accounts:create-spending-limit <ACCOUNT_ID> 100000 \
  4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU --period=one_time
```

## 环境变量

- 根目录 `.env`：`GRID_API_KEY`、`GRID_ENVIRONMENT`、`REQUEST_TIMEOUT_MS` 等
- CLI 会自动向上查找 `.env` 文件；无需在子目录重复配置。

## 项目结构

- `src/config.ts`：加载并校验环境变量
- `src/gridClient.ts`：Singleton GridClient 实例
- `src/accounts.ts`：封装账户相关 API
- `src/index.ts`：命令行入口（使用 `npm run dev -- <command>`）

## 后续计划

- 整合到统一后端服务，向前端暴露 REST/GraphQL 接口
- 扩展更多 Grid 功能（虚拟账户、交易 webhook 等）

