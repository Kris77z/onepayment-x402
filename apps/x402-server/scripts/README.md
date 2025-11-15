# X402 支付脚本使用说明

## 概述

`send-payment.ts` 是一个自动化脚本，用于模拟 X402 Paywall 的完整支付流程。它可以：

1. ✅ 使用私钥构建和签名 Solana SPL Token 转账交易
2. ✅ 生成符合 X402 协议的 `X-PAYMENT` header
3. ✅ 携带签名重新请求受保护的资源
4. ✅ 显示支付结果和交易哈希

---

## 快速开始

### 1. 准备测试钱包

你需要一个 Solana Devnet 钱包，并确保有足够的 USDC 和 SOL（用于手续费）。

#### 方式 A: 使用 Phantom 钱包导出私钥

1. 打开 Phantom 钱包
2. 设置 → 安全与隐私 → 导出私钥
3. 复制 Base58 格式的私钥

#### 方式 B: 生成新的测试钱包

```bash
# 使用 Solana CLI 生成新钱包
solana-keygen new --no-bip39-passphrase

# 或使用 Node.js
node -e "const {Keypair} = require('@solana/web3.js'); const kp = Keypair.generate(); const bs58 = require('bs58'); console.log('Public Key:', kp.publicKey.toBase58()); console.log('Private Key:', bs58.encode(kp.secretKey));"
```

### 2. 获取测试 USDC

访问 [Circle USDC Faucet](https://faucet.circle.com/) 获取 Solana Devnet USDC。

输入你的钱包地址，选择 **Solana Devnet**，点击获取。

### 3. 配置私钥

**方式 A：使用 .env 文件（推荐）**

```bash
# 1. 复制模板文件
cp .env.example .env

# 2. 编辑 .env 文件，填入你的私钥
nano .env
```

在 `.env` 文件中设置：
```bash
SOLANA_PRIVATE_KEY=your_private_key_here_in_base58_format
```

**方式 B：命令行传参**

```bash
SOLANA_PRIVATE_KEY='your_key_here' npm run payment
```

**⚠️ 安全提示**：
- ✅ `.env` 文件已添加到 `.gitignore`，不会被提交
- ✅ 仅在本地测试环境使用
- ✅ 使用专门的测试钱包，不要用主钱包

### 4. 启动开发服务器

确保 Next.js 开发服务器正在运行：

```bash
npm run dev
```

服务器应该在 `http://localhost:3000` 运行。

### 5. 运行支付脚本

**使用 .env 文件**：
```bash
npm run payment
```

**或使用命令行传参**：
```bash
SOLANA_PRIVATE_KEY='your_key_here' npm run payment
```

---

## 脚本输出示例

```
╔═══════════════════════════════════════════════════════════╗
║         X402 Solana Payment Script (Devnet)              ║
╚═══════════════════════════════════════════════════════════╝

🔑 Loading wallet from private key...
   Wallet: DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKQ

🌐 Connecting to Solana solana-devnet...
   ✅ Connected (Solana v1.18.0)

💰 Checking wallet balance...
   SOL: 1.5 SOL
   USDC: 100.0 USDC
   ✅ Sufficient balance for payment

📦 Building payment transaction...
   From: DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKQ
   To: CmGgLQL36Y9ubtTsy2zmE46TAxwCBm66onZmPPhUWNqv
   Amount: 10000 (atomic units)
   ✅ Transaction built with blockhash: 5VERv8NM...

✍️  Signing transaction...
   ✅ Transaction signed by DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKQ

🔐 Encoding X-PAYMENT header...
   ✅ X-PAYMENT header generated (1234 bytes)
   Preview: eyJzY2hlbWUiOiJleGFjdCIsIm5ldHdvcmsiOiJzb2xhbmEtZGV2bmV0Ii...

🚀 Retrying request to http://localhost:3000/content/cheap...
   Headers: X-PAYMENT (1234 chars)

📡 Response Status: 200 OK

✅ Payment Response:
{
  "success": true,
  "transaction": "5VERv8NMvZNj8HxqJJp4xJqjKp9N2RJw...",
  "network": "solana-devnet",
  "payer": "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKQ"
}

✅ SUCCESS! Access granted to protected content.
📄 Content preview (first 200 chars):

<!DOCTYPE html>
<html>
<head><title>Cheap Content</title></head>
<body><h1>Welcome to Cheap Content!</h1>...

🔗 Transaction on Solana Explorer:
   https://explorer.solana.com/tx/5VERv8NMvZNj8HxqJJp4xJqjKp9N2RJw...?cluster=devnet

✅ Payment flow completed!
```

---

## 工作原理

脚本执行以下步骤（参考 `PAYWALL_PAYMENT_FLOW.md` 第 4-5 节）：

### 1. 构建交易

```typescript
// 创建 SPL Token Transfer 指令
const transferInstruction = createTransferCheckedInstruction(
  fromTokenAccount,      // 发送方 Token 账户
  mintPubkey,            // USDC Mint 地址
  toTokenAccount,        // 接收方 Token 账户
  fromPubkey,            // 发送方公钥
  BigInt(amount),        // 金额（原子单位）
  6                      // USDC decimals
);
```

### 2. 签名交易

```typescript
transaction.partialSign(keypair);
```

### 3. 编码为 X-PAYMENT

```typescript
const payment = {
  scheme: 'exact',
  network: 'solana-devnet',
  transaction: {
    serialized: serialized.toString('base64'),
    signatures: [...],
  },
  resource: TARGET_URL,
  payTo: receiverAddress,
  asset: usdcMint,
  amount: amountInAtomicUnits,
};

const xPayment = Buffer.from(JSON.stringify(payment)).toString('base64');
```

### 4. 重新请求

```typescript
fetch(TARGET_URL, {
  headers: {
    'X-PAYMENT': xPayment,
  },
});
```

---

## 常见问题

### Q1: 脚本报错 "Insufficient balance"

**解决方案**：
- 访问 https://faucet.circle.com/ 获取测试 USDC
- 使用 `solana airdrop 1` 获取 SOL（用于手续费）

### Q2: 请求返回 402 状态码

**原因**：支付验证失败。

**可能的原因**：
1. 金额不足
2. 收款地址不匹配
3. 交易签名无效
4. Facilitator 未运行或配置错误

**调试步骤**：
- 检查 middleware.ts 中的 `payTo` 地址是否与脚本一致
- 确认 Facilitator URL 配置正确（`NEXT_PUBLIC_FACILITATOR_URL`）
- 查看服务器日志中的详细错误信息

### Q3: 如何查看交易详情？

脚本成功后会打印 Solana Explorer 链接：

```
https://explorer.solana.com/tx/{transaction_hash}?cluster=devnet
```

在浏览器中打开即可查看链上交易详情。

### Q4: 如何测试不同金额？

修改 `PAYMENT_CONFIG.amount`：

```typescript
// 0.01 USDC = 10000 (6 decimals)
amount: '10000',

// 0.25 USDC = 250000
amount: '250000',
```

**注意**：金额必须与 middleware 配置的路由价格匹配。

---

## 高级用法

### 从命令行参数读取私钥

修改脚本顶部：

```typescript
const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY || 'YOUR_PRIVATE_KEY_HERE';
```

然后运行：

```bash
SOLANA_PRIVATE_KEY="your_key_here" npm run payment
```

### 测试不同的路由

修改 `TARGET_URL`：

```typescript
// 测试 expensive 路由
const TARGET_URL = 'http://localhost:3000/content/expensive';

// 对应的金额
const PAYMENT_CONFIG = {
  amount: '250000', // 0.25 USDC
  // ...
};
```

### 连接 Mainnet

**⚠️ 警告：Mainnet 会消耗真实资金！**

```typescript
const PAYMENT_CONFIG = {
  network: 'solana-mainnet-beta',
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Mainnet USDC
  // ...
};
```

---

## 安全提示

⚠️ **切勿将私钥提交到 Git 仓库！**

建议：
1. 仅在本地测试环境使用
2. 使用专门的测试钱包
3. 使用 `.env` 文件存储私钥（已添加到 `.gitignore`）
4. 生产环境使用硬件钱包或 MPC 签名方案

---

## 相关文档

- [PAYWALL_PAYMENT_FLOW.md](../PAYWALL_PAYMENT_FLOW.md) - 完整支付流程详解
- [X402 Protocol Spec](https://github.com/x402/spec) - X402 协议规范
- [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/) - Solana SDK 文档

---

## 故障排除

### 类型错误

确保 TypeScript 配置正确：

```bash
# 检查 tsconfig.json 存在
ls tsconfig.json

# 如果不存在，创建：
npx tsc --init
```

### 依赖问题

重新安装依赖：

```bash
rm -rf node_modules package-lock.json
npm install
```

### 网络连接问题

如果 Solana RPC 超时，尝试更换 RPC 端点：

```typescript
rpcEndpoint: 'https://api.devnet.solana.com',
// 或
rpcEndpoint: 'https://solana-devnet.g.alchemy.com/v2/YOUR_API_KEY',
```

---

## License

MIT
