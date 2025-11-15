# X402 Paywall 支付流程详解

## 概述

X402 Paywall 页面是一个内嵌 React 应用的 HTML 页面，当用户访问受保护的路由但未携带有效的 `X-PAYMENT` header 时，middleware 会返回这个页面。该页面实现了完整的钱包连接、支付签名和请求重试逻辑。

---

## 1. 页面初始化

### 1.1 配置注入 (window.x402)

Middleware 在返回 Paywall HTML 时，会将支付配置注入到全局变量 `window.x402`：

```javascript
window.x402 = {
  amount: 0.01,
  paymentRequirements: [{
    scheme: "exact",
    network: "solana-devnet",
    maxAmountRequired: "10000",
    resource: "http://localhost:3000/content/cheap",
    description: "Access to cheap content",
    mimeType: "",
    payTo: "CmGgLQL36Y9ubtTsy2zmE46TAxwCBm66onZmPPhUWNqv",
    maxTimeoutSeconds: 60,
    asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    outputSchema: {
      input: {
        type: "http",
        method: "GET",
        discoverable: true
      }
    },
    extra: {
      feePayer: "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5"
    }
  }],
  testnet: false,
  currentUrl: "http://localhost:3000/content/cheap",
  config: {
    chainConfig: { /* 各链的 USDC 配置 */ }
  },
  cdpClientKey: "your_client_key_here",
  appName: "x402 Demo",
  appLogo: "/logos/x402-examples.png",
  sessionTokenEndpoint: "/api/x402/session-token"
};
```

**关键字段说明：**
- `amount`: 显示给用户的金额（美元）
- `paymentRequirements`: 支付要求数组，包含链、地址、金额等信息
- `currentUrl`: 支付成功后需要重新请求的 URL
- `network`: 目标区块链网络
- `payTo`: 收款地址
- `asset`: 支付资产的合约地址（USDC）
- `maxAmountRequired`: 最大所需金额（原子单位）
- `extra.feePayer`: Solana 交易的手续费支付方（由 Facilitator 提供）

---

## 2. React 应用架构

Paywall 页面是一个完整的 React 应用（打包在单个 `<script>` 标签中），主要组件包括：

### 2.1 主要组件结构

```
PaywallApp
├── WalletSelector (钱包选择下拉框)
├── WalletConnectionButton (连接钱包按钮)
├── PaymentSummary (支付信息摘要)
│   ├── WalletAddress (显示钱包地址)
│   ├── Balance (显示余额)
│   ├── Amount (显示支付金额)
│   └── Network (显示网络)
└── BuyFundsButton (可选：购买资金按钮 - Coinbase Onramp)
```

### 2.2 核心 Hooks

虽然代码已打包，但根据功能推断，应用使用了以下 React Hooks：

- `useState` - 管理钱包状态、连接状态、余额等
- `useEffect` - 监听钱包变化、检测余额、自动连接
- `useCallback` - 优化事件处理函数（连接、签名、支付）

---

## 3. 钱包连接流程

### 3.1 检测钱包

```javascript
// 伪代码 - 检测 Solana 钱包（如 Phantom）
useEffect(() => {
  const detectWallet = async () => {
    if (window.solana?.isPhantom) {
      setWalletAvailable(true);

      // 检查是否已连接
      if (window.solana.isConnected) {
        setWalletAddress(window.solana.publicKey.toString());
        await checkBalance();
      }
    } else {
      setWalletAvailable(false);
      showMessage("Install a Solana wallet such as Phantom");
    }
  };

  detectWallet();
}, []);
```

### 3.2 Connect Wallet 按钮点击

```javascript
const handleConnectWallet = async () => {
  try {
    // 请求连接钱包
    const response = await window.solana.connect();
    const publicKey = response.publicKey.toString();

    setWalletAddress(publicKey);
    setIsConnected(true);

    // 获取余额
    await checkBalance(publicKey);

    // 自动触发支付流程
    await handlePayment(publicKey);

  } catch (error) {
    console.error("Failed to connect wallet:", error);
    showError("Failed to connect wallet");
  }
};
```

### 3.3 余额检查

```javascript
const checkBalance = async (walletAddress) => {
  try {
    const connection = new Connection(
      window.x402.testnet
        ? "https://api.devnet.solana.com"
        : "https://api.mainnet-beta.solana.com"
    );

    // 获取 USDC Token Account
    const usdcMint = new PublicKey(window.x402.paymentRequirements[0].asset);
    const walletPubkey = new PublicKey(walletAddress);

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { mint: usdcMint }
    );

    if (tokenAccounts.value.length > 0) {
      const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      setBalance(balance);

      // 检查余额是否足够
      const requiredAmount = parseFloat(window.x402.amount);
      setHasSufficientBalance(balance >= requiredAmount);
    } else {
      setBalance(0);
      setHasSufficientBalance(false);
    }
  } catch (error) {
    console.error("Failed to check balance:", error);
  }
};
```

---

## 4. 支付签名生成流程

这是最核心的部分。当用户连接钱包后，应用会自动或手动触发支付流程。

### 4.1 构建支付交易

```javascript
const handlePayment = async (walletAddress) => {
  try {
    const paymentReq = window.x402.paymentRequirements[0];

    // 1. 构建 Solana Transfer 交易
    const transaction = await buildPaymentTransaction({
      from: walletAddress,
      to: paymentReq.payTo,
      amount: paymentReq.maxAmountRequired, // 原子单位
      mint: paymentReq.asset,
      feePayer: paymentReq.extra.feePayer
    });

    // 2. 请求钱包签名
    const signedTransaction = await requestWalletSignature(transaction);

    // 3. 生成 X-PAYMENT header
    const xPaymentHeader = encodePayment(signedTransaction, paymentReq);

    // 4. 重新请求原 URL，携带 X-PAYMENT
    await retryRequestWithPayment(xPaymentHeader);

  } catch (error) {
    console.error("Payment failed:", error);
    showError("Payment failed: " + error.message);
  }
};
```

### 4.2 构建 Solana 交易详情

```javascript
const buildPaymentTransaction = async ({ from, to, amount, mint, feePayer }) => {
  const connection = new Connection("https://api.devnet.solana.com");

  const fromPubkey = new PublicKey(from);
  const toPubkey = new PublicKey(to);
  const mintPubkey = new PublicKey(mint);
  const feePayerPubkey = new PublicKey(feePayer);

  // 获取或创建关联代币账户
  const fromTokenAccount = await getAssociatedTokenAddress(
    mintPubkey,
    fromPubkey
  );

  const toTokenAccount = await getAssociatedTokenAddress(
    mintPubkey,
    toPubkey
  );

  // 构建转账指令
  const transaction = new Transaction().add(
    createTransferCheckedInstruction(
      fromTokenAccount,      // source
      mintPubkey,            // mint
      toTokenAccount,        // destination
      fromPubkey,            // owner
      amount,                // amount (atomic)
      6                      // decimals (USDC = 6)
    )
  );

  // 设置手续费支付方
  transaction.feePayer = feePayerPubkey;

  // 获取最新 blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;

  return transaction;
};
```

### 4.3 请求钱包签名

```javascript
const requestWalletSignature = async (transaction) => {
  try {
    // 请求 Phantom 钱包签名（不广播）
    const signed = await window.solana.signTransaction(transaction);

    console.log("Transaction signed:", signed);
    return signed;

  } catch (error) {
    if (error.code === 4001) {
      throw new Error("User rejected the signature request");
    }
    throw error;
  }
};
```

### 4.4 编码为 X-PAYMENT Header

```javascript
const encodePayment = (signedTransaction, paymentRequirements) => {
  // 序列化签名后的交易
  const serialized = signedTransaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false
  });

  // 构建支付对象（遵循 X402 Exact Scheme）
  const payment = {
    scheme: "exact",
    network: paymentRequirements.network,
    transaction: {
      serialized: base64Encode(serialized),
      signatures: signedTransaction.signatures.map(sig => ({
        publicKey: sig.publicKey.toBase58(),
        signature: base64Encode(sig.signature)
      }))
    },
    resource: paymentRequirements.resource,
    payTo: paymentRequirements.payTo,
    asset: paymentRequirements.asset,
    amount: paymentRequirements.maxAmountRequired
  };

  // Base64 编码整个 payment 对象
  const xPayment = base64Encode(JSON.stringify(payment));

  return xPayment;
};

function base64Encode(data) {
  if (data instanceof Uint8Array) {
    return btoa(String.fromCharCode.apply(null, data));
  }
  return btoa(data);
}
```

---

## 5. 重新请求受保护资源

### 5.1 携带 X-PAYMENT 重新请求

```javascript
const retryRequestWithPayment = async (xPaymentHeader) => {
  try {
    showLoading("Processing payment...");

    const response = await fetch(window.x402.currentUrl, {
      method: "GET",
      headers: {
        "X-PAYMENT": xPaymentHeader,
        "Accept": "text/html"
      }
    });

    if (response.ok) {
      // 支付成功，显示内容
      const content = await response.text();

      // 检查是否有 X-PAYMENT-RESPONSE header
      const paymentResponse = response.headers.get("X-PAYMENT-RESPONSE");
      if (paymentResponse) {
        const decoded = JSON.parse(atob(paymentResponse));
        console.log("Payment settled:", decoded);
        showSuccess(`Payment successful! Transaction: ${decoded.transaction}`);
      }

      // 重定向或显示内容
      window.location.href = window.x402.currentUrl;

    } else if (response.status === 402) {
      // 支付验证失败
      const error = await response.json();
      showError(`Payment failed: ${error.error}`);

    } else {
      showError(`Request failed with status ${response.status}`);
    }

  } catch (error) {
    console.error("Request failed:", error);
    showError("Failed to complete payment");
  } finally {
    hideLoading();
  }
};
```

---

## 6. Middleware 验证流程

当带有 `X-PAYMENT` header 的请求到达 middleware 时：

### 6.1 解码和验证

```javascript
// middleware/index.js (简化版)

// 1. 解码 X-PAYMENT
const decodedPayment = exact.svm.decodePayment(paymentHeader);

// 2. 匹配支付要求
const selectedPaymentRequirements = findMatchingPaymentRequirements(
  paymentRequirements,
  decodedPayment
);

// 3. 验证签名和交易
const verification = await verify(decodedPayment, selectedPaymentRequirements);

if (!verification.isValid) {
  return NextResponse.json({
    error: verification.invalidReason,
    accepts: paymentRequirements
  }, { status: 402 });
}

// 4. 提交交易到区块链（结算）
const settlement = await settle(decodedPayment, selectedPaymentRequirements);

if (settlement.success) {
  // 5. 返回成功响应，并附带交易哈希
  response.headers.set(
    "X-PAYMENT-RESPONSE",
    base64Encode(JSON.stringify({
      success: true,
      transaction: settlement.transaction,
      network: settlement.network,
      payer: settlement.payer
    }))
  );
}

// 6. 放行请求，返回实际内容
return NextResponse.next();
```

### 6.2 Facilitator 验证和结算

Facilitator 是一个独立服务，负责：

1. **验证交易**：
   - 检查签名有效性
   - 验证金额、收款人、资产是否匹配
   - 确认交易未过期

2. **提交交易**：
   - 作为 fee payer 提交交易到 Solana 网络
   - 等待交易确认
   - 返回交易哈希

```javascript
// Facilitator verify() 伪代码
async function verify(payment, requirements) {
  // 反序列化交易
  const transaction = Transaction.from(base64Decode(payment.transaction.serialized));

  // 验证签名
  const isValidSignature = transaction.verifySignatures();

  // 验证交易内容
  const transfer = transaction.instructions.find(ix =>
    ix.programId.equals(TOKEN_PROGRAM_ID)
  );

  if (!transfer) {
    return { isValid: false, invalidReason: "No transfer instruction found" };
  }

  // 检查金额
  const amount = transfer.data.readBigUInt64LE(1);
  if (amount < BigInt(requirements.maxAmountRequired)) {
    return { isValid: false, invalidReason: "Insufficient amount" };
  }

  // 检查收款人
  if (!transfer.keys[1].pubkey.equals(new PublicKey(requirements.payTo))) {
    return { isValid: false, invalidReason: "Invalid recipient" };
  }

  return { isValid: true, payer: payment.transaction.signatures[0].publicKey };
}

// Facilitator settle() 伪代码
async function settle(payment, requirements) {
  const connection = new Connection("https://api.devnet.solana.com");

  const transaction = Transaction.from(
    base64Decode(payment.transaction.serialized)
  );

  // Facilitator 签名（作为 fee payer）
  transaction.partialSign(facilitatorKeypair);

  // 提交到链上
  const signature = await connection.sendRawTransaction(
    transaction.serialize()
  );

  // 等待确认
  await connection.confirmTransaction(signature, "confirmed");

  return {
    success: true,
    transaction: signature,
    network: requirements.network,
    payer: payment.transaction.signatures[0].publicKey
  };
}
```

---

## 7. 完整流程时序图

```
用户浏览器                 Paywall页面              Phantom钱包           Middleware            Facilitator           Solana链
    |                          |                        |                    |                      |                    |
    |--GET /content/cheap----->|                        |                    |                      |                    |
    |                          |<--检查X-PAYMENT------->|                    |                      |                    |
    |<--402 Paywall HTML-------|                        |                    |                      |                    |
    |                          |                        |                    |                      |                    |
    |  (显示支付页面)          |                        |                    |                      |                    |
    |  点击 "Connect Wallet"   |                        |                    |                      |                    |
    |------------------------->|--connect()------------>|                    |                      |                    |
    |                          |<--publicKey------------|                    |                      |                    |
    |                          |                        |                    |                      |                    |
    |  (构建支付交易)          |                        |                    |                      |                    |
    |                          |--signTransaction()---->|                    |                      |                    |
    |                          |   (用户批准)           |                    |                      |                    |
    |                          |<--signed tx------------|                    |                      |                    |
    |                          |                        |                    |                      |                    |
    |  (编码为 X-PAYMENT)      |                        |                    |                      |                    |
    |                          |                        |                    |                      |                    |
    |--GET /content/cheap------|----------------------->|                    |                      |                    |
    |   (带 X-PAYMENT header)  |                        |                    |                      |                    |
    |                          |                        |--decode payment--->|                      |                    |
    |                          |                        |--verify()--------->|                      |                    |
    |                          |                        |                    |--check signature---->|                    |
    |                          |                        |                    |--check amount------->|                    |
    |                          |                        |                    |<--isValid:true-------|                    |
    |                          |                        |                    |                      |                    |
    |                          |                        |                    |--settle()----------->|                    |
    |                          |                        |                    |                      |--sendTransaction-->|
    |                          |                        |                    |                      |                    |
    |                          |                        |                    |                      |<--confirmed--------|
    |                          |                        |                    |<--settlement---------|                    |
    |                          |                        |                    |                      |                    |
    |<--200 OK + Content-------|<-----------------------|                    |                      |                    |
    |   (X-PAYMENT-RESPONSE)   |                        |                    |                      |                    |
    |                          |                        |                    |                      |                    |
    |  (重定向到内容页面)      |                        |                    |                      |                    |
```

---

## 8. 关键代码位置

### 8.1 Middleware

- **文件**: `/Users/hardman/Code/data2cash/karot/solana-x402-test/middleware.ts`
- **核心逻辑**: `paymentMiddleware()` 函数
- **源码**: `node_modules/x402-next/dist/esm/index.js` (第82-288行)

### 8.2 Paywall HTML 模板

- **源码**: `node_modules/x402/dist/cjs/paywall/index.js`
- **函数**: `getPaywallHtml()`
- **说明**: 包含完整的 React 应用代码（已打包压缩）

### 8.3 支付验证

- **Scheme解码**: `node_modules/x402/dist/*/schemes/exact.js`
- **Facilitator**: 外部服务（URL配置在 `NEXT_PUBLIC_FACILITATOR_URL`）

---

## 9. 安全机制

### 9.1 双重验证

1. **客户端签名**: 用户钱包签名交易，确保授权
2. **服务端验证**: Middleware + Facilitator 验证签名和交易内容

### 9.2 防重放攻击

- 每个交易包含最新的 `recentBlockhash`
- `maxTimeoutSeconds` 限制交易有效期

### 9.3 金额保护

- 检查 `maxAmountRequired` 确保不超额扣费
- 验证收款地址和资产合约

---

## 10. 总结

**Pay Now 按钮的完整触发流程**：

1. **Connect Wallet** → 连接 Phantom 钱包
2. **Check Balance** → 检查 USDC 余额
3. **Build Transaction** → 构建 Solana SPL Token Transfer
4. **Sign Transaction** → 请求用户签名（**关键步骤**）
5. **Encode Payment** → 序列化交易并编码为 X-PAYMENT header
6. **Retry Request** → 重新请求原 URL，携带签名
7. **Verify & Settle** → Middleware 验证并通过 Facilitator 提交交易
8. **Redirect** → 支付成功，显示内容

整个流程**无需数据库**，所有状态通过 HTTP Headers 传递，实现了真正的去中心化支付验证。

---

## 附录：X-PAYMENT Header 格式示例

```json
{
  "scheme": "exact",
  "network": "solana-devnet",
  "transaction": {
    "serialized": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQABBCy...",
    "signatures": [
      {
        "publicKey": "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKQ",
        "signature": "5VERv8NMvZNj8HxqJJp4xJqjKp9N2RJw..."
      }
    ]
  },
  "resource": "http://localhost:3000/content/cheap",
  "payTo": "CmGgLQL36Y9ubtTsy2zmE46TAxwCBm66onZmPPhUWNqv",
  "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  "amount": "10000"
}
```

编码后（Base64）作为 `X-PAYMENT` header 发送。
