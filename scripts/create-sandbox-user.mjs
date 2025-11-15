import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { GridClient } from '@sqds/grid';

async function main() {
  const apiKey = process.env.GRID_API_KEY;
  if (!apiKey) {
    console.error('环境变量 GRID_API_KEY 未配置，请先在 .env 中填入 Sandbox API Key。');
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });

  const rawEmail = process.env.GRID_SANDBOX_EMAIL || (await rl.question('请输入 Sandbox 账号邮箱：'));
  const email = rawEmail.trim().toLowerCase();

  if (!email) {
    console.error('邮箱不能为空');
    process.exit(1);
  }

  const gridClient = new GridClient({
    environment: 'sandbox',
    apiKey,
    baseUrl: process.env.GRID_BASE_URL || 'https://grid.squads.xyz'
  });

  console.log('1) 生成 session secrets...');
  const sessionSecrets = await gridClient.generateSessionSecrets();
  console.log('session secrets 已生成');

  console.log(`2) 向 ${email} 发送 OTP...`);
  const user = await gridClient.createAccount({ email });
  console.log('createAccount 返回：', JSON.stringify(user, null, 2));
  console.log('已发送验证码，请检查邮箱。');

  const otpCode = (await rl.question('请输入邮箱收到的 6 位验证码：')).trim();

  if (!otpCode) {
    console.error('未输入验证码，流程终止。');
    process.exit(1);
  }

  console.log('3) 完成账户创建...');
  const verifiedAccount = await gridClient.completeAuthAndCreateAccount({
    user: { ...user, email },
    otpCode,
    sessionSecrets
  });

  console.log('\n账户创建成功，以下是 Sandbox 账户详情：');
  console.log(JSON.stringify(verifiedAccount, null, 2));
  console.log('\n请记录其中的 grid_user_id、address，并更新 .env 与 docs/address-inventory.md。');

  await rl.close();
}

main().catch((error) => {
  console.error('创建 Sandbox 账户失败：', error);
  process.exit(1);
});
