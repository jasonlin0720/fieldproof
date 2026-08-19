#!/usr/bin/env node
/**
 * fieldproof CLI。
 *
 * 資料錯誤是預期中的失敗路徑（人手寫 JSON），印乾淨的訊息即可，
 * 不要 stack trace 淹沒重點。
 */

import { pathToFileURL } from 'node:url';

import { build } from './build.js';
import { loadConfig } from './config.js';
import { formatRate } from './format.js';
import { DEFAULT_LOCALE } from './locales/index.js';

const USAGE = DEFAULT_LOCALE.cli.usage;

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
        throw new Error(DEFAULT_LOCALE.cli.configNeedsValue);
      }
      args.config = value;
      i += 1;
    } else if (arg.startsWith('-')) {
      throw new Error(DEFAULT_LOCALE.cli.unknownOption(arg));
    } else if (args.command === undefined) {
      args.command = arg;
    } else {
      throw new Error(DEFAULT_LOCALE.cli.extraArg(arg));
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
    throw new Error(`${DEFAULT_LOCALE.cli.unknownCommand(args.command)}\n\n${USAGE}`);
  }

  const config = loadConfig(args.config, process.cwd());
  const result = build(config, { check: args.check });

  if (args.check) {
    if (result.stale.length > 0) {
      throw new Error(
        DEFAULT_LOCALE.cli.outOfSync(
          config.command,
          result.stale.map((out) => out.path),
        ),
      );
    }
    console.log(DEFAULT_LOCALE.cli.inSync(result.outputs.length));
    return;
  }

  for (const { page, stats } of result.entries) {
    console.log(
      DEFAULT_LOCALE.cli.pageSummary(
        page.page,
        stats.queryCount,
        stats.pollingQueryCount,
        stats.sectionCount,
        stats.fieldCount,
      ),
    );
    console.log(DEFAULT_LOCALE.cli.loadSummary(stats.pollingHttpCount, formatRate(stats.perHour)));
  }
  for (const out of result.outputs) console.log(`  → ${out.path}`);
}

/** 僅在被直接執行時跑；被 import（測試）時只取用其中的純函式。 */
function isDirectRun(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  try {
    main();
  } catch (error) {
    console.error(DEFAULT_LOCALE.cli.failHeader);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
