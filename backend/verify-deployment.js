#!/usr/bin/env node

/**
 * Pre-deployment verification script
 * Checks that the backend is ready for Vercel
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 ClearView Backend - Pre-Deployment Verification\n');

const checks = {
  '.env file exists': () => fs.existsSync('.env'),
  'OPENAI_API_KEY set': () => {
    const env = fs.readFileSync('.env', 'utf8');
    return env.includes('OPENAI_API_KEY=sk-');
  },
  'package.json exists': () => fs.existsSync('package.json'),
  'index.js exists': () => fs.existsSync('index.js'),
  'vercel.json exists': () => fs.existsSync('vercel.json'),
  'node_modules exists': () => fs.existsSync('node_modules'),
  'Dependencies installed': () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const hasExpress = fs.existsSync('node_modules/express');
    const hasAxios = fs.existsSync('node_modules/axios');
    return hasExpress && hasAxios;
  },
  'AI module works': () => {
    try {
      require('./ai');
      return true;
    } catch {
      return false;
    }
  },
  'Auth module works': () => {
    try {
      require('./auth');
      return true;
    } catch {
      return false;
    }
  },
};

let passed = 0;
let failed = 0;

for (const [check, fn] of Object.entries(checks)) {
  try {
    const result = fn();
    if (result) {
      console.log(`✅ ${check}`);
      passed++;
    } else {
      console.log(`❌ ${check}`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ ${check} - ${err.message}`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
  console.log('✨ Backend is ready for deployment to Vercel!\n');
  console.log('Next steps:');
  console.log('1. git push to GitHub');
  console.log('2. Go to vercel.com/new and import your repository');
  console.log('3. Set environment variables in Vercel dashboard');
  console.log('4. Deploy!');
  process.exit(0);
} else {
  console.log('⚠️  Please fix the issues above before deploying.\n');
  process.exit(1);
}
