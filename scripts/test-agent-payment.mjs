#!/usr/bin/env node

/**
 * 测试 RateAgent x402 微支付功能
 * 
 * 通过调用 API 的 /quote 端点触发 RateAgent 支付
 * 
 * 用法：
 *   node scripts/test-agent-payment.mjs
 */

import { config } from 'dotenv';

config();

async function testAgentPayment() {
  console.log('🧪 测试 RateAgent x402 微支付功能\n');
  console.log('=' .repeat(60));

  // 检查环境变量
  const agentPrivateKey = process.env.RATE_AGENT_PRIVATE_KEY;
  const paymentAmount = process.env.RATE_AGENT_PAYMENT_AMOUNT || '1000';
  const facilitatorUrl = process.env.FACILITATOR_URL || 'http://localhost:3001';

  console.log('📋 配置检查:');
  console.log(`   RATE_AGENT_PRIVATE_KEY: ${agentPrivateKey ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`   RATE_AGENT_PAYMENT_AMOUNT: ${paymentAmount} (${Number.parseInt(paymentAmount, 10) / 1_000_000} USDC)`);
  console.log(`   FACILITATOR_URL: ${facilitatorUrl}`);
  console.log('');

  if (!agentPrivateKey) {
    console.error('❌ 错误: RATE_AGENT_PRIVATE_KEY 未配置');
    process.exit(1);
  }

  // 检查 Facilitator 是否可用
  console.log('🔍 检查 Facilitator 服务...');
  try {
    const res = await fetch(`${facilitatorUrl}/.well-known/x402/supported-payment-kinds`);
    if (!res.ok) {
      throw new Error(`Facilitator 返回 ${res.status}`);
    }
    const config = await res.json();
    console.log('✅ Facilitator 服务可用');
    console.log(`   网络: ${config.paymentKinds?.['solana-exact']?.network || 'N/A'}`);
    console.log(`   收款地址: ${config.paymentKinds?.['solana-exact']?.payTo || 'N/A'}`);
    console.log(`   Fee Payer: ${config.paymentKinds?.['solana-exact']?.feePayer || 'N/A'}`);
    console.log('');
  } catch (error) {
    console.error(`❌ Facilitator 服务不可用: ${error.message}`);
    console.error(`   请确保 Facilitator 运行在 ${facilitatorUrl}`);
    process.exit(1);
  }

  // 通过 API 调用触发 RateAgent 支付
  console.log('💳 调用 API /quote 触发 RateAgent 支付...');
  console.log('=' .repeat(60));

  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4000';
  
  // 等待缓存过期（30秒），确保触发新的汇率查询和支付
  console.log('⏳ 等待缓存过期（30秒）以确保触发新的汇率查询...');
  await new Promise(resolve => setTimeout(resolve, 31000));

  console.log('📡 调用 /api/payments/quote...');
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${apiBaseUrl}/api/payments/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: 1000000, // 1 USDC
        currency: 'USDC'
      })
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 返回错误: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const result = await response.json();
    
    console.log('');
    console.log('📊 API 响应:');
    console.log('=' .repeat(60));
    console.log(`   成功: ${result.success}`);
    console.log(`   报价 ID: ${result.data?.quoteId || 'N/A'}`);
    console.log(`   汇率: ${result.data?.rate || 'N/A'}`);
    console.log(`   汇率来源: ${result.data?.rateSource || 'N/A'}`);
    console.log(`   耗时: ${duration}ms`);
    console.log('');

    if (result.data?.rateSource === 'switchboard') {
      console.log('✅ 从 Switchboard 获取了新汇率，应该已触发 Agent 支付');
      console.log('');
      console.log('📝 请检查 API 服务日志，查找以下信息:');
      console.log('   - [AgentPayment] 开头的日志');
      console.log('   - 交易签名（如果支付成功）');
      console.log('   - 错误信息（如果支付失败）');
      console.log('');
      console.log('💡 提示: Agent 支付是异步执行的，不会阻塞 API 响应');
      console.log('   如果支付成功，您应该能在 Solana Explorer 上看到交易');
    } else {
      console.log('⚠️  使用了缓存汇率，未触发新的支付');
      console.log('   这是正常的，因为缓存有效期为 30 秒');
    }

    console.log('');
    console.log('🎉 测试完成！请检查 API 服务日志确认 Agent 支付状态。');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ API 调用失败:', error.message);
    process.exit(1);
  }
}

testAgentPayment().catch((error) => {
  console.error('\n❌ 测试失败:', error);
  process.exit(1);
});

