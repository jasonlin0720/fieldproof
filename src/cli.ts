#!/usr/bin/env node
/**
 * fieldproof CLI。
 *
 * 資料錯誤是預期中的失敗路徑（人手寫 JSON），印乾淨的訊息即可，
 * 不要 stack trace 淹沒重點。
 */

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from './build.js';
import { loadConfig } from './config.js';
import { findDrift } from './drift.js';
import { formatRate } from './format.js';
import { DEFAULT_LOCALE, getLocale } from './locales/index.js';
import { installSkill, resolveSkillDest, SKILL_SOURCE } from './skill.js';

import type { Locale } from './locales/index.js';

interface Args {
  check: boolean;
  version: boolean;
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
    version: false,
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
    else if (arg === '-v' || arg === '--version') args.version = true;
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

/**
 * 套件版本。從 package.json 讀而非編譯期內嵌——內嵌會讓 `dist/` 與 `package.json` 有兩個
 * 事實來源，發版時漏改一邊就對不上。`../package.json` 由 `src/` 與 `dist/` 共用同一行解析。
 */
function readVersion(): string {
  const path = fileURLToPath(new URL('../package.json', import.meta.url));
  const pkg: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return (pkg as { version: string }).version;
}

/**
 * 設定檔的語系；讀不到設定檔（或設定壞掉）就退回預設。
 *
 * 用於不強制要設定檔、但有設定就該尊重它的指令。刻意吞掉錯誤：`fieldproof skill` 不該
 * 因為設定檔壞了就不能用——那正是還沒把設定弄對的人需要它的時候。
 */
function tryLocale(explicitPath: string | undefined): Locale {
  try {
    return getLocale(loadConfig(explicitPath, process.cwd()).locale);
  } catch {
    return DEFAULT_LOCALE;
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    console.log(readVersion());
    return;
  }
  // 說明與版本都不強制要設定檔，但設定檔若在就該尊重它的語系。
  if (args.help || args.command === undefined) {
    console.log(tryLocale(args.config).cli.usage);
    return;
  }
  if (args.command === 'skill') {
    // skill 指令不強制要設定檔——它可能正是「還沒有設定檔」的人要跑的第一個指令。
    // 但設定檔若在，就該尊重它的語系，不然設了 locale 的人只有這個指令拿到別的語言。
    const locale = tryLocale(args.config);
    const { cli } = locale;
    if (!args.install) {
      console.log(cli.skillWhere(SKILL_SOURCE, resolveSkillDest(process.cwd(), args.to)));
      return;
    }
    const { dest } = installSkill(process.cwd(), args.to, locale);
    console.log(cli.skillInstalled(dest));
    return;
  }

  if (args.command !== 'build') {
    const { cli } = tryLocale(args.config);
    throw new Error(`${cli.unknownCommand(args.command)}\n\n${cli.usage}`);
  }

  const config = loadConfig(args.config, process.cwd());
  // 讀完設定才知道語系。在這之前（參數解析、找不到設定檔）只能用 DEFAULT_LOCALE。
  const { cli } = getLocale(config.locale);
  const result = build(config, { check: args.check });

  /**
   * 資料檔是否該重新盤點的提示。刻意只是提示：它轉述的是 git 的事實，不是內容比對，
   * 誤報（純格式化的 commit）是預期的，故不影響 `--check` 的退出碼。
   */
  const reportDrift = (): void => {
    const drifted = findDrift(
      result.entries.map(({ page }) => page),
      config.rootDir,
      config.dataDirAbs,
    );
    if (drifted.length === 0) return;

    const changed = drifted.filter((report) => report.changed.length > 0);
    const missing = drifted.filter((report) => report.missing.length > 0);

    if (changed.length > 0) {
      console.log(`\n${cli.driftHeader}`);
      for (const report of changed) {
        const { date = '', sha = '' } = report.since ?? {};
        console.log(cli.driftPage(report.page, sha, date, report.changed));
      }
    }
    if (missing.length > 0) {
      console.log(`\n${cli.driftMissingHeader}`);
      for (const report of missing) {
        console.log(cli.driftMissingPage(report.page, report.missing));
      }
    }
  };

  if (args.check) {
    const problems = [
      result.stale.length > 0
        ? cli.outOfSync(
            config.command,
            result.stale.map((out) => out.path),
          )
        : '',
      result.orphans.length > 0 ? cli.orphans(result.orphans) : '',
    ].filter(Boolean);

    if (problems.length > 0) {
      reportDrift();
      throw new Error(problems.join('\n\n'));
    }
    console.log(cli.inSync(result.outputs.length));
    reportDrift();
    return;
  }

  for (const { page, stats } of result.entries) {
    console.log(
      cli.pageSummary(
        page.page,
        stats.queryCount,
        stats.pollingQueryCount,
        stats.sectionCount,
        stats.fieldCount,
      ),
    );
    console.log(cli.loadSummary(stats.pollingHttpCount, formatRate(stats.perHour)));
    // 剛跑完盤點的人最該知道還有幾格沒追出來——那是下一步的工作清單。
    if (stats.unresolvedCount > 0) console.log(cli.unresolvedSummary(stats.unresolvedCount));
  }
  for (const out of result.outputs) console.log(`  → ${out.path}`);
  if (result.orphans.length > 0) console.log(`\n${cli.orphans(result.orphans)}`);
  reportDrift();
}

/**
 * 這個模組是不是被當成進入點執行的。
 *
 * **必須先解析 symlink。** 消費端執行的是 `node_modules/.bin/fieldproof`，那是一個指向
 * `dist/cli.js` 的 symlink：`process.argv[1]` 是 symlink 路徑，`import.meta.url` 卻是
 * 真實路徑，直接比字串永遠不相等——於是 `main()` 不會跑，CLI 靜默退出 0 什麼都不做。
 * 那是 `npx fieldproof` / `pnpm fieldproof` / 任何 npm script 走的路，也就是所有人。
 */
export function isEntryPoint(moduleUrl: string, entry: string | undefined): boolean {
  if (entry === undefined) return false;
  try {
    return moduleUrl === pathToFileURL(realpathSync(entry)).href;
  } catch {
    // 進入點不存在（極少見）就當作不是直接執行，而不是讓載入模組這件事拋錯。
    return false;
  }
}

/** 僅在被直接執行時跑；被 import（測試）時只取用其中的純函式。 */
function isDirectRun(): boolean {
  return isEntryPoint(import.meta.url, process.argv[1]);
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
