#!/usr/bin/env node
/**
 * fieldproof CLI。
 *
 * 資料錯誤是預期中的失敗路徑（人手寫 JSON），印乾淨的訊息即可，
 * 不要 stack trace 淹沒重點。
 */

import { build } from './build.js';
import { loadConfig } from './config.js';

const USAGE = `用法：
  fieldproof build [選項]        驗證資料並生成 HTML / markdown / index

選項：
  --check                       只驗證並比對現有生成物；不同步則非零退出
  --config <path>               指定設定檔（預設自 cwd 向上探尋 fieldproof.config.json）
  -h, --help                    顯示本說明
`;

interface Args {
  check: boolean;
  command: string | undefined;
  config: string | undefined;
  help: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { check: false, command: undefined, config: undefined, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === '--check') args.check = true;
    else if (arg === '-h' || arg === '--help') args.help = true;
    else if (arg === '--config') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error('--config 後面要接設定檔路徑');
      }
      args.config = value;
      i += 1;
    } else if (arg.startsWith('-')) {
      throw new Error(`未知選項：${arg}`);
    } else if (args.command === undefined) {
      args.command = arg;
    } else {
      throw new Error(`多餘的參數：${arg}`);
    }
  }

  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.command === undefined) {
    console.log(USAGE);
    return;
  }
  if (args.command !== 'build') {
    throw new Error(`未知指令：${args.command}\n\n${USAGE}`);
  }

  const config = loadConfig(args.config, process.cwd());
  const result = build(config, { check: args.check });

  if (args.check) {
    if (result.stale.length > 0) {
      throw new Error(
        `以下生成物與資料不同步，請執行 \`${config.command}\`：\n` +
          result.stale.map((out) => `  ${out.path}`).join('\n'),
      );
    }
    console.log(`✓ ${result.outputs.length} 個生成物皆與資料同步`);
    return;
  }

  for (const { page, stats } of result.entries) {
    console.log(
      `${page.page}：${stats.queryCount} 個查詢（${stats.pollingQueryCount} 個輪詢）、` +
        `${stats.sectionCount} 個區塊、${stats.fieldCount} 個欄位`,
    );
    console.log(
      `  單次全量刷新 ${stats.pollingHttpCount} 支 HTTP　` +
        `每分鐘 ${stats.perMinute} 支　每小時 ${stats.perHour} 支`,
    );
  }
  for (const out of result.outputs) console.log(`  → ${out.path}`);
}

try {
  main();
} catch (error) {
  console.error('\n✖ fieldproof 失敗\n');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
