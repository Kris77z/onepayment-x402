#!/usr/bin/env node

/**
 * 测试 Payment Intent 创建，验证 GRID_USER_ID 是否匹配
 */

import 'dotenv/config';
import { GridClient } from '@sqds/grid';

const GRID_API_KEY = process.env.GRID_API_KEY;
const GRID_ENVIRONMENT = process.env.GRID_ENVIRONMENT || 'sandbox';
const GRID_USER_ID = process.env.GRID_USER_ID;
const MERCHANT_GRID_ACCOUNT_ID = process.env.MERCHANT_GRID_ACCOUNT_ID;
const COMMISSION_GRID_ACCOUNT_ID = process.env.COMMISSION_GRID_ACCOUNT_ID;
const COMMISSION_SOLANA_ADDRESS = process.env.COMMISSION_SOLANA_ADDRESS || COMMISSION_GRID_ACCOUNT_ID;

if (!GRID_API_KEY || !GRID_USER_ID || !MERCHANT_GRID_ACCOUNT_ID || !COMMISSION_GRID_ACCOUNT_ID) {
  console.error('❌ 缺少必要环境变量: GRID_API_KEY, GRID_USER_ID, MERCHANT_GRID_ACCOUNT_ID, COMMISSION_GRID_ACCOUNT_ID');
  process.exit(1);
}

console.log('🧪 测试 Payment Intent 创建，验证 GRID_USER_ID 是否匹配');
console.log('='.repeat(60));
console.log(`Grid User ID: ${GRID_USER_ID}`);
console.log(`商户账户: ${MERCHANT_GRID_ACCOUNT_ID}`);
console.log(`佣金账户: ${COMMISSION_SOLANA_ADDRESS}`);
console.log();

const gridClient = new GridClient({
  apiKey: GRID_API_KEY,
  environment: GRID_ENVIRONMENT,
  baseUrl: process.env.GRID_BASE_URL || 'https://grid.squads.xyz'
});

async function testPaymentIntent() {
  try {
    console.log('📝 创建 Payment Intent（测试金额：1000 USDC，即 1000000 最小单位）...');
    
    const result = await gridClient.createPaymentIntent(
      MERCHANT_GRID_ACCOUNT_ID,
      {
        amount: '1000000', // 1 USDC (6 decimals)
        grid_user_id: GRID_USER_ID,
        source: {
          account: MERCHANT_GRID_ACCOUNT_ID,
          currency: 'usdc'
        },
        destination: {
          address: COMMISSION_SOLANA_ADDRESS,
          currency: 'usdc'
        },
        memo: 'Test payment intent for GRID_USER_ID verification'
      }
    );

    if ('error' in result && result.error) {
      console.error('❌ Payment Intent 创建失败:');
      console.error(JSON.stringify(result.error, null, 2));
      
      // 检查是否是 GRID_USER_ID 不匹配的错误
      const errorStr = JSON.stringify(result.error).toLowerCase();
      if (errorStr.includes('user') || errorStr.includes('grid_user_id') || errorStr.includes('unauthorized')) {
        console.error('\n⚠️  可能的原因：GRID_USER_ID 与新 API Key 不匹配');
        console.error('   解决方案：运行 scripts/create-sandbox-user.mjs 获取新的 GRID_USER_ID');
      }
      
      process.exit(1);
    }

    const intent = result.data || result;
    console.log('✅ Payment Intent 创建成功！');
    console.log('\n📋 Payment Intent 详情:');
    console.log(JSON.stringify({
      id: intent.id,
      status: intent.status,
      amount: intent.amount,
      source: intent.source,
      destination: intent.destination,
      createdAt: intent.created_at
    }, null, 2));

    if (intent.status === 'awaiting_funds') {
      console.log('\n⚠️  状态为 awaiting_funds：商户账户余额不足，需要充值 USDC');
    } else if (intent.status === 'ready') {
      console.log('\n✅ 状态为 ready：可以签名并提交交易');
    }

    console.log('\n✅ GRID_USER_ID 验证通过！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    
    // 检查是否是 GRID_USER_ID 相关的错误
    const errorStr = error.message.toLowerCase();
    if (errorStr.includes('user') || errorStr.includes('grid_user_id') || errorStr.includes('unauthorized') || errorStr.includes('403')) {
      console.error('\n⚠️  可能的原因：GRID_USER_ID 与新 API Key 不匹配');
      console.error('   解决方案：运行 scripts/create-sandbox-user.mjs 获取新的 GRID_USER_ID');
    }
    
    process.exit(1);
  }
}

testPaymentIntent();

