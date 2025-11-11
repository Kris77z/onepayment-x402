# Apps 目录说明

> 三个子应用共同组成 Solana PayAgent Gateway 的最小演示闭环。

## 子项目总览

- `apps/web`：Next.js 前端，负责买家支付引导与结果展示，默认运行在 `http://localhost:3000`。
- `apps/api`：Express + TypeScript 服务，暴露 `/api/payments/*` 与 `/api/grid/*` 接口，默认端口 `4000`。
- `apps/grid`：封装 Grid SDK 的 CLI 工具，支持账户查询、转账记录检索与调试脚本。

## 安装与启动

```bash
# 根目录
npm install

# Grid CLI
cd apps/grid
npm install
npm run dev -- help

# API 服务
cd ../api
npm install
npm run dev

# Web 前端
cd ../web
npm install
npm run dev
```

## 约定与注意事项

- 三个项目共享根目录 `.env` 中的关键变量（`GRID_API_KEY`、`FACILITATOR_PRIVATE_KEY` 等），必要时可在各子目录追加 `.env.local` 覆盖局部配置。
- 所有 TypeScript/JavaScript 文件需保持单文件不超过 200 行，若有新增模块请提前规划文件拆分。
- 运行 `test-facilitator-flow.mjs` 前，请确保 API 与 Web 服务已启动，并在根目录执行命令。

