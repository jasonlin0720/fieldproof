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
import { installSkill, resolveSkillDest, SKILL_SOURCE } from './skill.js';

const USAGE = DEFAULT_LOCALE.cli.usage;

interface Args {
  check: boolean;
  command: string | undefined;
  config: string | undefined;
  help: boolean;
  install: boolean;
  to: string | undefined;
}

/** 各指令認得的選項。用來擋「選項存在但不屬於這個指令」，而非靜默忽略。 */
const OPTIONS_OF: Record<string, string[]> = {
  build: ['--check', '--config'],
  skill: ['--install', '--to'],
};

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    check: false,
    command: undefined,
    config: undefined,
    help: false,
    install: false,
    to: undefined,
  };
  const seen: string[] = [];

  /** 取 `--opt <value>` 的值；缺值或誤接下一個選項都當場報錯。 */
  const valueFor = (option: string, index: number): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('-')) {
      throw new Error(DEFAULT_LOCALE.cli.optionNeedsValue(option));
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === '--check') {
      args.check = true;
      seen.push(arg);
    } else if (arg === '--install') {
      args.install = true;
      seen.push(arg);
    } else if (arg === '-h' || arg === '--help') args.help = true;
    else if (arg === '--config') {
      args.config = valueFor(arg, i);
      seen.push(arg);
      i += 1;
    } else if (arg === '--to') {
      args.to = valueFor(arg, i);
      seen.push(arg);
      i += 1;
    } else if (arg.startsWith('-')) {
      throw new Error(DEFAULT_LOCALE.cli.unknownOption(arg));
    } else if (args.command === undefined) {
      args.command = arg;
    } else {
      throw new Error(DEFAULT_LOCALE.cli.extraArg(arg));
    }
  }

  const allowed = args.command === undefined ? undefined : OPTIONS_OF[args.command];
  if (allowed !== undefined) {
    for (const option of seen) {
      if (!allowed.includes(option)) {
        throw new Error(DEFAULT_LOCALE.cli.optionNotForCommand(option, args.command as string));
      }
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
  if (args.command === 'skill') {
    // skill 指令不需要設定檔——它可能正是「還沒有設定檔」的人要跑的第一個指令。
    const { cli } = DEFAULT_LOCALE;
    if (!args.install) {
      console.log(cli.skillWhere(SKILL_SOURCE, resolveSkillDest(process.cwd(), args.to)));
      return;
    }
    const { dest } = installSkill(process.cwd(), args.to, DEFAULT_LOCALE);
    console.log(cli.skillInstalled(dest));
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
