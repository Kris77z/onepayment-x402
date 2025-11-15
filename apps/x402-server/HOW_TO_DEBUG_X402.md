# 如何调试和分析 X402 源码

## 前言

这份文档记录了我如何通过分析 `x402-next` 和 `x402` 包的源码，从零开始理解支付流程并解决实际问题。希望这个方法论能帮助你快速掌握任何 npm 包的内部机制。

---

## 第一步：理解问题的起点

### 初始问题
用户想要创建一个脚本来模拟 Paywall 支付流程，但不清楚具体的实现细节。

### 分析策略
1. **从用户视角出发**：先理解 Paywall 页面做了什么
2. **追踪数据流**：找到关键的 Header 和数据结构
3. **反向工程**：从错误信息倒推正确格式

---

## 第二步：定位关键代码位置

### 2.1 使用 `package.json` 找到依赖包

```bash
cat package.json
```

**发现关键依赖**：
```json
{
  "dependencies": {
    "x402-next": "^0.7.1"  // Next.js middleware 集成
  }
}
```

### 2.2 探索 `node_modules` 结构

```bash
ls -la node_modules/x402-next/
```

**输出**：
```
dist/
  ├── cjs/          # CommonJS 版本
  └── esm/          # ES Module 版本
package.json
README.md
```

**关键发现**：
- 代码已打包，需要查看编译后的 `dist` 目录
- 优先看 `esm` 版本（更现代，可读性更好）

---

## 第三步：使用 Grep 快速搜索关键词

### 3.1 搜索 `paymentMiddleware` 函数

```bash
grep -r "paymentMiddleware" node_modules/x402-next --include="*.js"
```

**结果**：找到了 `dist/esm/index.js` 中的导出

### 3.2 查看完整函数实现

```bash
cat node_modules/x402-next/dist/esm/index.js
```

**核心发现**（第 82-288 行）：

```javascript
function paymentMiddleware(payTo, routes, facilitator, paywall) {
  const { verify, settle, supported } = useFacilitator(facilitator);
  const x402Version = 1;

  return async function middleware(request) {
    const pathname = request.nextUrl.pathname;
    const paymentHeader = request.headers.get("X-PAYMENT");

    if (!paymentHeader) {
      // 返回 Paywall HTML
      return new NextResponse2(html, {
        status: 402,
        headers: { "Content-Type": "text/html" }
      });
    }

    // 验证支付
    const verification = await verify(decodedPayment, selectedPaymentRequirements);
    if (!verification.isValid) {
      return new NextResponse2(JSON.stringify({...}), { status: 402 });
    }

    // 结算并放行
    const settlement = await settle(...);
    return NextResponse2.next();
  };
}
```

**学到的关键点**：
1. Middleware 检查 `X-PAYMENT` header
2. 没有 header → 返回 402 + HTML
3. 有 header → 验证 → 结算 → 放行

---

## 第四步：通过错误信息反向推导格式

### 4.1 第一个错误：`bs58.decode is not a function`

**问题分析**：
```javascript
const bs58 = require("bs58");
const secretKey = bs58.decode(privateKeyBase58);  // ❌ 失败
```

**解决方法**：
1. 检查 `bs58` 包的导出格式
2. 改用 ES6 `import` 语法

```javascript
import bs58 from "bs58";
const secretKey = bs58.decode(privateKeyBase58);  // ✅ 成功
```

### 4.2 第二个错误：Zod 验证失败

**错误信息**：
```json
{
  "issues": [
    {
      "code": "invalid_type",
      "expected": "number",
      "received": "undefined",
      "path": ["x402Version"],
      "message": "Required"
    },
    {
      "path": ["payload"],
      "message": "Required"
    }
  ]
}
```

**分析步骤**：

#### 步骤 1：识别错误类型
- `ZodError` → 说明使用了 Zod 库做 schema 验证
- `path: ["x402Version"]` → 缺少 `x402Version` 字段
- `path: ["payload"]` → 缺少 `payload` 字段

#### 步骤 2：搜索 Schema 定义

```bash
grep -r "x402Version\|payload" node_modules/x402/dist --include="*.js" -A 3 -B 3
```

**找到关键代码**：
```javascript
var PaymentPayloadSchema = import_zod3.z.object({
  x402Version: import_zod3.z.number().refine((val) => x402Versions.includes(val)),
  scheme: import_zod3.z.enum(schemes),
  network: NetworkSchema,
  payload: import_zod3.z.union([ExactEvmPayloadSchema, ExactSvmPayloadSchema])
});
```

**推导出正确格式**：
```javascript
{
  x402Version: 1,           // ✅ 必需
  scheme: "exact",
  network: "solana-devnet",
  payload: {                // ✅ 必需
    // 这里应该是什么？
  }
}
```

#### 步骤 3：查找 `ExactSvmPayloadSchema`

```bash
grep -B 5 -A 10 "ExactSvmPayloadSchema" node_modules/x402/dist/cjs/schemes/index.js
```

**发现**：
```javascript
var ExactSvmPayloadSchema = import_zod3.z.object({
  transaction: import_zod3.z.string().regex(Base64EncodedRegex)
});
```

**最终格式**：
```javascript
{
  x402Version: 1,
  scheme: "exact",
  network: "solana-devnet",
  payload: {
    transaction: "base64_encoded_transaction"  // ✅ 关键！
  }
}
```

### 4.3 第三个错误：指令数量不匹配

**错误信息**：
```
"error": "invalid_exact_svm_payload_transaction_instructions_length"
```

**分析步骤**：

#### 步骤 1：搜索错误码定义

```bash
grep -A 20 "invalid_exact_svm_payload_transaction_instructions_length" \
  node_modules/x402/dist/cjs/schemes/index.js
```

**找到验证逻辑**：
```javascript
async function verifyTransactionInstructions(transactionMessage, ...) {
  if (transactionMessage.instructions.length !== 3 &&
      transactionMessage.instructions.length !== 4) {
    throw new Error(`invalid_exact_svm_payload_transaction_instructions_length`);
  }

  verifyComputeLimitInstruction(transactionMessage.instructions[0]);
  verifyComputePriceInstruction(transactionMessage.instructions[1]);
  // ... 验证 transfer instruction
}
```

**关键发现**：
- 期望 **3 或 4 条指令**
- 第 1 条：`SetComputeUnitLimit`
- 第 2 条：`SetComputeUnitPrice`
- 第 3 条：`TransferChecked`
- 第 4 条（可选）：创建 ATA

#### 步骤 2：查看我们的交易构建

**问题代码**：
```javascript
const transaction = new Transaction();
transaction.add(transferInstruction);  // ❌ 只有 1 条指令
```

**修复代码**：
```javascript
const transaction = new Transaction();

// 1. Set Compute Unit Limit
transaction.add(
  ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })
);

// 2. Set Compute Unit Price
transaction.add(
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 })
);

// 3. Transfer
transaction.add(transferInstruction);

// ✅ 现在有 3 条指令
```

---

## 核心调试技巧总结

### 技巧 1：使用 Grep 快速定位

```bash
# 搜索特定函数或变量
grep -r "paymentMiddleware" node_modules/x402-next --include="*.js"

# 搜索错误码
grep -r "invalid_exact_svm_payload" node_modules/x402 --include="*.js"

# 搜索 Schema 定义（带上下文）
grep -B 5 -A 10 "PaymentPayloadSchema" node_modules/x402/dist/cjs/schemes/index.js

# 搜索并显示行号
grep -n "x402Version" node_modules/x402/dist/cjs/schemes/index.js
```

### 技巧 2：从错误信息倒推

**错误信息告诉你什么？**

| 错误类型 | 含义 | 调试方向 |
|---------|------|---------|
| `ZodError` | Schema 验证失败 | 搜索对应的 Schema 定义 |
| `invalid_type` | 类型不匹配 | 检查 `expected` vs `received` |
| `path: ["field"]` | 缺少字段 | 搜索该字段在 Schema 中的定义 |
| 自定义错误码 | 业务逻辑失败 | 搜索错误码字符串找到验证逻辑 |

**示例：分析 ZodError**

```json
{
  "code": "invalid_type",
  "expected": "number",
  "received": "undefined",
  "path": ["x402Version"]
}
```

**推导**：
1. `path: ["x402Version"]` → 顶层字段
2. `expected: "number"` → 应该是数字
3. `received: "undefined"` → 我们没有提供
4. **结论**：需要在根对象添加 `x402Version: 1`

### 技巧 3：查看类型定义文件

```bash
# 查找 TypeScript 类型定义
find node_modules/x402-next -name "*.d.ts"

# 查看导出的类型
cat node_modules/x402-next/dist/esm/index.d.mts
```

**发现**：
```typescript
export declare function paymentMiddleware(
  payTo: Address,
  routes: Record<string, RouteConfig>,
  facilitator: FacilitatorConfig,
  paywall?: PaywallConfig
): (request: NextRequest) => Promise<NextResponse>;
```

### 技巧 4：使用浏览器开发者工具

**查看实际请求**：
1. 打开浏览器 DevTools (F12)
2. Network 标签
3. 访问受保护的 URL
4. 查看 402 响应
5. 复制 `accepts` 字段（这是正确的 `paymentRequirements`）

**示例**：
```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana-devnet",
      "payTo": "...",
      "asset": "...",
      // ... 完整的支付要求
    }
  ]
}
```

### 技巧 5：添加调试日志

**在脚本中添加调试输出**：

```javascript
console.log('📋 Payment structure:', JSON.stringify(payment, null, 2));
console.log('🔐 X-PAYMENT header:', xPayment.substring(0, 100));
console.log('📦 Transaction instructions:', transaction.instructions.length);
```

**在服务端添加日志**：

```javascript
// middleware.ts
console.log('🔵 Middleware called:', {
  url: req.url,
  hasXPayment: !!req.headers.get('X-PAYMENT'),
});
```

---

## 实战案例：完整的调试流程

### 问题：脚本返回 402 错误

#### 第 1 步：收集错误信息

```bash
npm run payment
```

**输出**：
```
❌ Payment Failed!
Error: [object Object]
```

#### 第 2 步：改进错误输出

**修改脚本**：
```javascript
const error = await response.json();
console.log('Full error:', JSON.stringify(error, null, 2));
```

**新输出**：
```json
{
  "error": {
    "issues": [
      {
        "path": ["x402Version"],
        "message": "Required"
      }
    ]
  }
}
```

#### 第 3 步：搜索 Schema

```bash
grep -r "x402Version" node_modules/x402/dist/cjs/schemes/index.js -B 3 -A 3
```

**发现 Schema**：
```javascript
var PaymentPayloadSchema = z.object({
  x402Version: z.number(),
  // ...
});
```

#### 第 4 步：修复代码

```javascript
const payment = {
  x402Version: 1,  // ✅ 添加
  scheme: "exact",
  // ...
};
```

#### 第 5 步：重新测试

```bash
npm run payment
```

**新错误**：
```
"error": "invalid_exact_svm_payload_transaction_instructions_length"
```

#### 第 6 步：搜索新错误

```bash
grep -A 10 "invalid_exact_svm_payload_transaction_instructions_length" \
  node_modules/x402/dist/cjs/schemes/index.js
```

**发现逻辑**：
```javascript
if (instructions.length !== 3 && instructions.length !== 4) {
  throw new Error('invalid_exact_svm_payload_transaction_instructions_length');
}
```

#### 第 7 步：添加缺失的指令

```javascript
transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }));
transaction.add(transferInstruction);
```

#### 第 8 步：验证成功 ✅

```bash
npm run payment
```

**输出**：
```
✅ SUCCESS! Access granted to protected content.
🔗 Transaction: https://explorer.solana.com/tx/...
```

---

## 高级技巧：阅读压缩代码

### 挑战：代码被压缩和混淆

**示例**（实际的打包代码）：
```javascript
var a=import_zod3.z.object({b:import_zod3.z.number(),c:import_zod3.z.string()});
```

### 解决方法 1：使用 Source Map

```bash
# 查找 .map 文件
find node_modules/x402 -name "*.map"

# 使用 source-map-explorer
npx source-map-explorer node_modules/x402/dist/esm/index.mjs
```

### 解决方法 2：搜索字符串常量

**压缩后的代码仍保留字符串**：

```bash
# 搜索错误消息
grep "invalid_exact_svm_payload" node_modules/x402/dist/cjs/schemes/index.js

# 搜索字段名
grep "x402Version" node_modules/x402/dist/cjs/schemes/index.js
```

### 解决方法 3：格式化代码

```bash
# 安装 prettier
npm install -g prettier

# 格式化压缩代码
prettier --write node_modules/x402/dist/cjs/schemes/index.js

# 或使用在线工具
# https://prettier.io/playground/
```

---

## 工具箱：我的常用命令

### 快速搜索

```bash
# 搜索函数定义
grep -rn "function paymentMiddleware" node_modules/

# 搜索导出
grep -rn "export.*paymentMiddleware" node_modules/

# 搜索类型定义
grep -rn "type PaymentPayload" node_modules/

# 搜索错误码（区分大小写）
grep -r "invalid_exact_svm" node_modules/x402/dist/

# 搜索并高亮
grep --color=always -r "x402Version" node_modules/x402/dist/
```

### 文件操作

```bash
# 查看文件结构
tree node_modules/x402-next -L 3

# 查看包信息
cat node_modules/x402-next/package.json | jq '.main, .types'

# 查看文件大小
du -sh node_modules/x402-next/dist/*

# 统计代码行数
wc -l node_modules/x402-next/dist/esm/index.js
```

### 内容分析

```bash
# 提取所有导出
grep -o "export.*" node_modules/x402-next/dist/esm/index.js

# 查找所有 Schema 定义
grep -n "Schema.*=.*z\.object" node_modules/x402/dist/cjs/schemes/index.js

# 查找所有错误码
grep -o '"invalid_[^"]*"' node_modules/x402/dist/cjs/schemes/index.js | sort -u
```

---

## 学习路径建议

### 第一阶段：了解基础

1. ✅ 阅读 README 和文档
2. ✅ 查看 `package.json` 了解依赖
3. ✅ 运行示例代码
4. ✅ 使用浏览器 DevTools 观察请求

### 第二阶段：深入源码

1. ✅ 定位主要函数（如 `paymentMiddleware`）
2. ✅ 理解数据流（输入 → 处理 → 输出）
3. ✅ 查找 Schema 定义（Zod, TypeScript 类型）
4. ✅ 绘制流程图

### 第三阶段：调试实践

1. ✅ 故意制造错误
2. ✅ 分析错误信息
3. ✅ 搜索相关代码
4. ✅ 修复并验证

### 第四阶段：深入理解

1. ✅ 阅读测试用例（如果有）
2. ✅ 查看 GitHub Issues
3. ✅ 贡献改进（提 PR）

---

## 资源清单

### 必备工具

- ✅ **grep** - 文本搜索
- ✅ **jq** - JSON 处理
- ✅ **tree** - 目录结构
- ✅ **prettier** - 代码格式化
- ✅ **Chrome DevTools** - 网络抓包

### 在线工具

- [AST Explorer](https://astexplorer.net/) - 解析 JavaScript AST
- [Prettier Playground](https://prettier.io/playground/) - 格式化代码
- [Regex101](https://regex101.com/) - 正则表达式测试
- [Base64 Decoder](https://www.base64decode.org/) - Base64 编解码

### 学习资源

- [Zod Documentation](https://zod.dev/) - Schema 验证库
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/) - Solana SDK
- [X402 Specification](https://github.com/x402) - 协议规范

---

## 总结：调试的核心思维

### 1. **从结果倒推**
不要从头开始写，先看错误信息，反推需要什么。

### 2. **善用搜索**
99% 的问题可以通过 `grep` 定位到源码。

### 3. **理解 Schema**
现代库大量使用 Schema 验证（Zod, Joi 等），找到 Schema = 找到答案。

### 4. **保持耐心**
一次解决一个错误，每个错误都是线索。

### 5. **记录过程**
写下你的调试步骤，下次遇到类似问题可以复用。

---

## 实战练习

### 练习 1：找到 EVM 支付格式

**任务**：通过阅读源码，推导出 EVM (Ethereum/Base) 的 X-PAYMENT 格式。

**提示**：
```bash
grep -A 20 "ExactEvmPayloadSchema" node_modules/x402/dist/cjs/schemes/index.js
```

### 练习 2：理解 Facilitator

**任务**：找到 `useFacilitator` 的实现，理解 `verify` 和 `settle` 做了什么。

**提示**：
```bash
grep -B 5 -A 30 "useFacilitator" node_modules/x402-next/dist/esm/index.js
```

### 练习 3：添加自定义验证

**任务**：在本地 fork X402，添加对自定义 Token 的支持。

**步骤**：
1. Clone X402 源码
2. 找到 `verifyTransactionInstructions`
3. 添加你的验证逻辑
4. 本地测试

---

## 结语

调试源码不是魔法，是一套可复制的方法论：

1. **观察**：看错误信息
2. **搜索**：找相关代码
3. **理解**：读懂逻辑
4. **修复**：改代码
5. **验证**：测试

每次调试都是学习的机会。坚持下去，你会发现任何 npm 包都不再神秘。

**Happy Debugging! 🐛🔍**

---

## 附录：本次调试的完整时间线

| 时间点 | 问题 | 解决方法 | 学到的技巧 |
|-------|------|---------|-----------|
| T+0 | 不知道 X-PAYMENT 格式 | 抓包看 Paywall 页面 | 使用浏览器 DevTools |
| T+5 | `bs58.decode` 报错 | 改用 ES6 import | 理解模块导出格式 |
| T+10 | ZodError: 缺少字段 | grep 搜索 Schema | 从 Schema 推导格式 |
| T+15 | 指令数量错误 | grep 搜索验证逻辑 | 理解业务规则 |
| T+20 | ✅ 支付成功！ | - | 完整理解流程 |

**总耗时**：~20 分钟
**关键命令数**：~10 条 grep
**学习收获**：理解了 X402 完整流程 + Solana 交易构建

---

**如果这份文档对你有帮助，请给 X402 项目一个 ⭐！**
