#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import url from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const templateDir = path.join(repoRoot, 'template');

const args = process.argv.slice(2);
const nameArg = args.find((a) => !a.startsWith('-'));
const projectName = nameArg || 'my-x402-next-app';
const targetDir = path.resolve(process.cwd(), projectName);

if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length) {
  console.error(`\nTarget directory '${projectName}' is not empty. Choose another name or empty it.\n`);
  process.exit(1);
}

// copy template
fs.cpSync(templateDir, targetDir, { recursive: true });

// ensure the root package.json name matches the project
const rootPkgPath = path.join(targetDir, 'package.json');
if (fs.existsSync(rootPkgPath)) {
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
  rootPkg.name = projectName.replace(/[^a-zA-Z0-9-_./@]/g, '-');
  fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2));
}

// perform post-scaffold steps for convenience
console.log(`\nSetting up your project in: ${targetDir}`);

// 1) Copy environment template for Next.js (.env.local preferred)
try {
  // Look for common env template filenames in priority order
  const candidates = [
    { file: 'env.local', label: 'env.local' },
    { file: '.env-local', label: '.env-local' },
    { file: 'env.example', label: 'env.example' },
    { file: '.env.example', label: '.env.example' },
  ];

  const found = candidates
    .map((c) => ({ ...c, abs: path.join(targetDir, c.file) }))
    .find((c) => fs.existsSync(c.abs));

  const envTarget = path.join(targetDir, '.env');

  if (found) {
    console.log(`- Creating .env from ${found.label}`);
    fs.copyFileSync(found.abs, envTarget);
  } else {
    console.log('- No env template found; please create .env manually');
  }
} catch (err) {
  console.warn('- Skipped env setup:', err instanceof Error ? err.message : String(err));
}

// 2) Install dependencies (always)
try {
  console.log('- Installing dependencies (npm install)...');
  execSync('npm install', { stdio: 'inherit', cwd: targetDir });
} catch (err) {
  console.warn('- npm install failed, you may run it manually:', err instanceof Error ? err.message : String(err));
}

// init git (best-effort)
try {
  execSync('git init', { stdio: 'ignore', cwd: targetDir });
} catch {}

// print next steps
console.log(`
Successfully created ${projectName}!

You now have a starter example for a Next.js app integrated with x402.

Next steps:
  cd ${projectName}
  # edit values inside .env
  npm run dev

Happy building 🏗️
`);
