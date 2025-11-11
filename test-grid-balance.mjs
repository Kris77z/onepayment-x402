#!/usr/bin/env node

/**
 * Grid 余额查询测试
 * 
 * 测试 Grid API 余额查询功能，验证商户账户状态
 */

import { config } from 'dotenv';

// 加载环境变量
config();

const GRID_API_KEY = process.env.GRID_API_KEY;
const GRID_ENVIRONMENT = process.env.GRID_ENVIRONMENT || 'sandbox';
const GRID_ACCOUNT_ID = process.env.GRID_ACCOUNT_ID;
const MERCHANT_ADDRESS = process.env.MERCHANT_SOLANA_ADDRESS;

if (!GRID_API_KEY || !GRID_ACCOUNT_ID || !MERCHANT_ADDRESS) {
  console.error('❌ 缺少必要环境变量: GRID_API_KEY, GRID_ACCOUNT_ID, MERCHANT_SOLANA_ADDRESS');
  process.exit(1);
}

console.log('🏦 开始 Grid 余额查询测试');
console.log('='.repeat(50));
console.log(`Grid Environment: ${GRID_ENVIRONMENT}`);
console.log(`Account ID: ${GRID_ACCOUNT_ID}`);
console.log(`Merchant Address: ${MERCHANT_ADDRESS}`);
console.log();

async function testGridBalance() {
  try {
    // 查询账户余额
    console.log('💰 查询账户余额...');
    
    const balanceResponse = await fetch(`https://grid.squads.xyz/api/grid/v1/accounts/${GRID_ACCOUNT_ID}/balances`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GRID_API_KEY}`,
        'x-grid-environment': GRID_ENVIRONMENT,
      },
    });
    
    if (!balanceResponse.ok) {
      const errorBody = await balanceResponse.text();
      throw new Error(`余额查询失败: ${balanceResponse.status} ${balanceResponse.statusText}\n${errorBody || '(no response body)'}`);
    }
    
    const balanceData = await balanceResponse.json();
    console.log('💰 账户余额:', JSON.stringify(balanceData, null, 2));
    
    // 查询最近交易
    console.log('\n📋 查询最近交易...');
    
    const transfersResponse = await fetch(`https://grid.squads.xyz/api/grid/v1/accounts/${GRID_ACCOUNT_ID}/transfers?limit=10`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GRID_API_KEY}`,
        'x-grid-environment': GRID_ENVIRONMENT,
      },
    });
    
    if (!transfersResponse.ok) {
      const errorBody = await transfersResponse.text();
      throw new Error(`交易查询失败: ${transfersResponse.status} ${transfersResponse.statusText}\n${errorBody || '(no response body)'}`);
    }
    
    const transfersData = await transfersResponse.json();
    console.log('📋 最近交易:', JSON.stringify(transfersData, null, 2));
    
    // 查询账户详情
    console.log('\n🔍 查询账户详情...');
    
    const accountResponse = await fetch(`https://grid.squads.xyz/api/grid/v1/accounts/${GRID_ACCOUNT_ID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GRID_API_KEY}`,
        'x-grid-environment': GRID_ENVIRONMENT,
      },
    });
    
    if (!accountResponse.ok) {
      const errorBody = await accountResponse.text();
      throw new Error(`账户详情查询失败: ${accountResponse.status} ${accountResponse.statusText}\n${errorBody || '(no response body)'}`);
    }
    
    const accountData = await accountResponse.json();
    console.log('🔍 账户详情:', JSON.stringify(accountData, null, 2));
    
    console.log('\n✅ Grid 余额查询测试完成!');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// 运行测试
testGridBalance();
