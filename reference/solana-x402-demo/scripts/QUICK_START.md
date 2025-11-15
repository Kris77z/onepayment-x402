# 快速开始指南

## 📦 一键设置

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 编辑 .env，填入你的私钥
nano .env
# 或
code .env
```

## 🔑 获取私钥

### 方法 1：从 Phantom 钱包导出

1. 打开 Phantom 钱包
2. 设置 → 安全与隐私 → 导出私钥
3. 输入密码确认
4. 复制 Base58 格式的私钥

### 方法 2：生成新的测试钱包

```bash
# 使用 Solana CLI
solana-keygen new --no-bip39-passphrase

# 或使用 Node.js
node -e "
const {Keypair} = require('@solana/web3.js');
const bs58 = require('bs58');
const kp = Keypair.generate();
console.log('Public Key:', kp.publicKey.toBase58());
console.log('Private Key:', bs58.encode(kp.secretKey));
"
```

## 💰 获取测试 USDC

访问 https://faucet.circle.com/

- 网络：Solana Devnet
- 输入你的钱包地址
- 点击 "Get USDC"

## 🚀 运行脚本

```bash
# 确保开发服务器在运行
npm run dev

# 在新终端运行支付脚本
npm run payment
```

## ✅ 预期输出

```
╔═══════════════════════════════════════════════════════════╗
║         X402 Solana Payment Script (Devnet)              ║
╚═══════════════════════════════════════════════════════════╝

🔑 Loading wallet from private key...
   Wallet: 5QKQsbu3zvbTe412wCsnwFpwbo2t3vuvJVMYpeoT6QHu

🌐 Connecting to Solana solana-devnet...
   ✅ Connected (Solana v1.18.0)

💰 Checking wallet balance...
   SOL: 1.5 SOL
   USDC: 100.0 USDC
   ✅ Sufficient balance for payment

✅ SUCCESS! Access granted to protected content.
🔗 Transaction: https://explorer.solana.com/tx/...?cluster=devnet
```

## 🐛 常见问题

### 错误：`SOLANA_PRIVATE_KEY environment variable not set`

**解决**：确保已创建 `.env` 文件并设置了私钥

```bash
# 检查 .env 文件
cat .env

# 应该包含
SOLANA_PRIVATE_KEY=your_key_here
```

### 错误：`Insufficient USDC balance`

**解决**：访问 https://faucet.circle.com/ 获取测试 USDC

### 错误：`Connection refused`

**解决**：确保 Next.js 开发服务器正在运行

```bash
npm run dev
```

---

**需要帮助？** 查看完整文档：`scripts/README.md`
