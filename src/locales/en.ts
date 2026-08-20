/**
 * English locale.
 *
 * `ui` 底下全部是純字串（會被序列化進 HTML 供瀏覽器讀取）；需要複數變化者以
 * `{n|singular|plural}` 表示，由 `format.ts` / `app.js` 的 `fmt()` 代入。
 * 其餘區段跑在 Node，直接用函式判斷即可。
 */

import type { Locale } from './types.js';

/** 兩形態的數量片語。只有 md / cli / errors 用得到——ui 不能放函式。 */
const plural = (n: number, one: string, other = `${one}s`): string =>
  `${n} ${n === 1 ? one : other}`;

export const en: Locale = {
  id: 'en',
  htmlLang: 'en',

  source: {
    direct: 'API direct',
    'backend-agg': 'Backend total',
    'fe-pick': 'FE picks one',
    'fe-agg': 'FE aggregate',
    'fe-derive': 'FE derived',
    'fe-const': 'FE hardcoded',
  },

  origin: {
    card: 'Card data',
    component: 'Shared component',
    layout: 'Layout level',
  },

  sectionKind: {
    card: 'Card',
    chart: 'Chart',
    filter: 'Filter',
    form: 'Form',
    table: 'Table',
  },

  flag: {
    exception: { icon: '⚠', label: 'Deliberate deviation from the site-wide convention' },
    'backend-pending': { icon: '🕓', label: 'Backend undecided / current workaround' },
    fragile: { icon: '⚡', label: 'Fragile: relies on string matching and the like' },
  },

  interval: {
    none: 'no polling',
    hour: 'every hour',
    minute: 'every minute',
    second: 'every second',
    hours: (n) => `every ${n} hours`,
    minutes: (n) => `every ${n} min`,
    seconds: (n) => `every ${n} s`,
    ms: (n) => `every ${n} ms`,
  },

  cli: {
    usage: `Usage:
  fieldproof build [options]     Validate the data and generate HTML / markdown / index
  fieldproof skill [--install]   Show / install the skill shipped with this package

build options:
  --check                        Validate and compare only; non-zero exit when out of sync
  --config <path>                Config file (default: search upward from cwd)

skill options:
  --install                      Actually copy. Without it, only prints source and destination
  --to <dir>                     Where to install (default: .claude/skills/fieldproof)

  -h, --help                     Show this help
`,
    failHeader: '\n✖ fieldproof failed\n',
    inSync: (n) => `✓ ${plural(n, 'generated file')} in sync with the data`,
    orphans: (paths) =>
      'These generated files no longer have a data file. Delete them ' +
      '(this command will not — they are probably committed):\n' +
      paths.map((p) => `  ${p}`).join('\n'),
    outOfSync: (command, paths) =>
      `These generated files are out of sync with the data. Run \`${command}\`:\n` +
      paths.map((p) => `  ${p}`).join('\n'),
    pageSummary: (page, queries, polling, sections, fields) =>
      `${page}: ${plural(queries, 'query', 'queries')} (${polling} polling), ` +
      `${plural(sections, 'section')}, ${plural(fields, 'field')}`,
    loadSummary: (pollingHttp, perHour) =>
      `  ${plural(pollingHttp, 'HTTP request')} per full refresh   ${perHour} per hour`,
    unknownOption: (arg) => `Unknown option: ${arg}`,
    unknownCommand: (arg) => `Unknown command: ${arg}`,
    extraArg: (arg) => `Unexpected argument: ${arg}`,
    optionNeedsValue: (option) => `${option} needs a value`,
    optionNotForCommand: (option, command) => `${option} is not an option of ${command}`,
    skillWhere: (source, dest) =>
      `Skill source: ${source}\nWould install to: ${dest}\n\nAdd --install to actually copy.`,
    skillInstalled: (dest) =>
      `✓ Skill installed to ${dest}\n  Re-run this command after upgrading fieldproof to update it.`,
  },

  errors: {
    dataDirMissing: (dir) => `Data directory does not exist: ${dir}`,
    noDataFiles: (dir) => `No .json data files in ${dir}`,
    dataNotJson: (file, detail) => `${file} is not valid JSON: ${detail}`,
    invalidPage: (file, detail) => `${file} does not match the schema:\n${detail}`,
    pageNameMismatch: (file, declared, expected) =>
      `${file}: page (${declared}) does not match the filename (${expected})`,
    duplicateSectionKey: (file, key) => `${file}: duplicate section.key: ${key}`,
    duplicateFieldId: (file, sectionKey, id) =>
      `${file}: duplicate field.id inside ${sectionKey}: ${id}`,
    duplicateFilter: (file, id, owner, filter) =>
      `${file}: ${id} and ${owner} use the same Network filter "${filter}" — ` +
      'the two queries would be indistinguishable in the DevTools panel. Use a more precise fragment.',
    respPlaceholder: (file, sectionKey, fieldId) =>
      `${file}: ${sectionKey}/${fieldId} has a dash for resp. ` +
      'Use null when the field does not come from an API — the dash is a display concern, owned by the locale.',
    conditionalNeedsEnabledWhen: (file, id) =>
      `${file}: ${id} is marked conditional but has no enabledWhen — ` +
      'the reconciliation list would name the query without saying when it fires. Add the condition.',
    unknownQueryRef: (file, sectionKey, fieldId, queryId) =>
      `${file}: ${sectionKey}/${fieldId} references a query that does not exist: ${queryId}`,
    configNotFound: (filename, cwd) =>
      `Could not find ${filename} (searched upward from ${cwd}).\n` +
      'Create one at the project root, or pass --config <path>.',
    configMissing: (path) => `Config file does not exist: ${path}`,
    configNotJson: (path, detail) => `${path} is not valid JSON: ${detail}`,
    configInvalid: (path, detail) => `${path} does not match the config schema:\n${detail}`,
    skillSourceMissing: (dir) =>
      `Cannot find the skill shipped with this package: ${dir}\n` +
      'This usually means an incomplete install — reinstall fieldproof.',
    unknownLocale: (id, available) => `Unknown locale: ${id} (available: ${available.join(', ')})`,
  },

  md: {
    titleWithRoute: (title, route) => `# ${title} (\`${route}\`) field map`,
    titleWithoutRoute: (title) => `# ${title} field map`,
    generatedBy: (command, dataPath) =>
      `> ⚠️ **Generated by \`${command}\` from \`${dataPath}\` — do not edit by hand**`,
    generatedByCont:
      '> Any manual edit is overwritten on the next run. Change the JSON and rebuild.',
    openHtml: (page) =>
      `> **To review by hand, open [\`${page}.html\`](./${page}.html)** — tick fields off, ` +
      'filter, export a punch list;',
    audienceNote: '> this markdown is for LLMs to read and for `git diff` to review.',
    auditedAt: (date) =>
      `> Audited: **${date}** (the day the code was read, not the day the UI was verified)`,
    sourcesHeading: '> Source files read while writing this page:',

    overviewHeading: '## Overview',
    overviewCounts: (sections, fields, queries) =>
      `- **${plural(sections, 'section')}, ${plural(fields, 'field')}**, ` +
      `built from **${plural(queries, 'query', 'queries')}**`,
    overviewPolling: (pollingQueries, pollingHttp) =>
      `- **${plural(pollingQueries, 'query', 'queries')}** poll; ` +
      `one full refresh = **${plural(pollingHttp, 'HTTP request')}**`,
    overviewLoad: (perHour, breakdown) => `- Polling load: **${perHour} per hour**${breakdown}`,
    overviewBaseline: (base, conditional) =>
      `- **Network baseline: ${plural(base, 'request')} on page load**` +
      (conditional
        ? `, plus ${plural(conditional, 'conditional request')} (absent when the card is hidden)`
        : ''),
    overviewSources: (counts) => `- Field distribution: ${counts}`,
    overviewDerivedNote: [
      '> These numbers are derived from the query definitions, not hand-written — add a query',
      '> or change an interval and they follow. Tabs left open multiply the real load.',
    ],
    intervalBreakdown: (parts) => ` (${parts.join('; ')})`,
    intervalPart: (label, httpCount, perHour) => `${label} × ${httpCount} = ${perHour}/h`,

    queriesHeading: '## Queries',
    queryTableHead: [
      '| #   | Endpoint | Network filter | Key params | Refresh | Count | Origin |',
      '| --- | -------- | -------------- | ---------- | ------- | ----- | ------ |',
    ],
    queryCount: (n) => String(n),
    conditionalSuffix: ' (conditional)',
    queryNotesHeading: '**Query notes**',
    filterNoteLabel: (note) => `**Filter caveat:** ${note}`,
    enabledWhenAll: (condition) =>
      `> \`enabledWhen\` for every query: ${condition} — the query is disabled when it does not hold.`,
    enabledWhenHeading: '> `enabledWhen` (the query is disabled when it does not hold):',
    enabledWhenItem: (ids, condition) => `> - **${ids.join(', ')}**: ${condition}`,

    sectionHeading: (index, title, key) => `## ${index}. ${title} \`${key}\``,
    emptyRule: (rule) => `**Empty state**: ${rule}`,
    fieldTableHead: [
      '| UI field | Query | Response field | How it is obtained | Display |',
      '| -------- | ----- | -------------- | ------------------ | ------- |',
    ],
    checksHeading: '**Verification checks**',
    fieldNotesHeading: '**Field notes**',

    notesHeading: '## Known gaps / caveats',
    noteItem: (index, title) => `${index}. **${title}**`,

    placeholder: '—',
    join: {
      params: ', ',
      meta: ' · ',
      flags: '; ',
      flagAndNote: ' — ',
      query: ' + ',
    },
    sectionMeta: (kind, meta) => `${kind}${meta ? ' · ' + meta : ''}`,
    metaPair: (key, value) => `${key} ${value}`,
    fieldRow: (source, how) => `**${source}**: ${how}`,
    checkGroup: (label) => `- **${label}**`,
    checkItem: (given, expect) => `  - \`${given}\` → ${expect}`,
    fieldNote: (label, parts) => `- **${label}**: ${parts}`,
    flagWithLabel: (icon, label) => `${icon} ${label}`,
    sourceCount: (label, count) => `${label} ${count}`,
    sourceCountJoin: ' · ',
    queryNoteItem: (id) => `- **${id}**:`,
    sourceItem: (source) => `> - \`${source}\``,
  },

  ui: {
    pageTitle: '{title} field map · review',
    heading: '{title} field map',
    generatedComment:
      'Generated by `{command}` from {dataPath}. Do not edit by hand — change the JSON and rebuild.',
    faviconComment:
      'Empty favicon: stops the browser requesting /favicon.ico, so the Network panel stays at zero external requests',
    indexTitle: 'Field maps',
    indexLead:
      'For every number on screen: which API, what granularity, which response field, taken as-is or computed on the frontend.',
    indexSource:
      'Source data is {dataDir}/*.json. This page and every HTML / markdown page is generated by {command}.',
    indexColPage: 'Page',
    indexColRoute: 'Route',
    indexColSections: 'Sections',
    indexColFields: 'Fields',
    indexColQueries: 'Queries',
    indexColLoad: 'Polling load (HTTP)',
    indexColAudited: 'Audited',
    indexColMarkdown: 'For LLMs',
    indexQueries: '{n} ({polling} polling)',
    indexLoad: '{n} per hour',

    metaSections: '{n} {n|section|sections}',
    metaFields: '{n} {n|field|fields}',
    metaQueries:
      '{n} {n|query|queries} ({polling} polling, {http} HTTP per full refresh; {perHour} per hour)',
    metaAudited: 'audited {date}',

    progressVerified: 'Verified',
    progressNoProblem: 'no problems',
    progressProblem: '{n} {n|problem|problems}',
    progressFiltered: '(filtered: {n})',

    btnReconcile: 'Reconcile Network',
    btnExport: 'Export punch list',
    btnReset: 'Reset',
    btnClose: 'Close',
    btnCopy: 'Copy',
    btnCopyFilter: 'Copy filter',
    btnCopyNetworkFilter: 'Copy Network filter',
    copyFilterTitle: 'Copy "{filter}" to paste into the DevTools Network filter',

    searchPlaceholder: 'Search field / response / how…',
    searchAria: 'Search',
    groupLabel: 'Group',
    groupAria: 'Grouping',
    groupBySection: 'By section',
    groupByQuery: 'By query',
    filterSection: 'Section',
    filterQuery: 'Query',
    filterSource: 'Source',
    statusLabel: 'Status',
    statusAria: 'Review status',
    statusAll: 'All',
    statusUnverified: 'Unverified',
    statusProblem: 'Problems',
    statusStale: 'Definition changed',

    colField: 'UI field',
    colQuery: 'Query',
    colResp: 'Response field',
    colExpect: 'Expected value / display',
    colActual: 'Value on screen',
    colData: 'Data',
    colDisplay: 'Display',
    colNote: 'Note',

    sideData: 'data',
    sideDisplay: 'display',
    markOk: 'correct',
    markNg: 'broken',
    markStaleHint: 'This side was redefined after you marked it — please re-verify',
    respNone: '— (not from an API)',
    expandAria: 'Expand details',
    staleTagTitle: 'This field was redefined in the JSON after you marked it — please re-verify',
    staleBoth: 'Definition changed',
    staleData: 'Data definition changed',
    staleDisplay: 'Display definition changed',
    checksTag: '{n} {n|check|checks}',
    checksTagTitle: 'Expand to see {n} verification {n|check|checks}',
    actualPlaceholder: 'What you saw',
    actualAria: 'Value on screen',
    notePlaceholder: 'Note',
    noteAria: 'Note',

    detailConcurrent: '{n} in parallel',
    detailFilter: 'Filter',
    detailEndpoint: 'Endpoint',
    detailSdk: 'SDK',
    detailEnabledWhen: 'Enabled when',
    detailFilterNote: 'Filter caveat: ',
    detailChecksTitle: 'How to verify ({n} {n|case|cases})',
    detailChecksGiven: 'Given',
    detailChecksExpect: 'The screen should',
    detailEmptyRule: 'Empty state: ',
    detailNoteTitle: 'Notes',
    detailNoApi: 'This field does not come from any API; the frontend generates it.',

    groupProgress: '{done}/{total} verified',
    groupNg: '{n} {n|problem|problems}',
    groupEmptyInfo: 'ⓘ Empty state',
    groupEmptyTitle: 'Empty state: {rule}',
    groupNoQuery: 'No query (frontend generated)',
    groupNoQueryMeta: 'axis labels, hardcoded units, local UI state',
    emptyState: 'No fields match the current filters',

    notesHeading: 'Known gaps / caveats',

    reconcileTitle: 'Network reconciliation',
    reconcileLead:
      "On page load the Network panel should show {base} (excluding conditional requests and the browser's own resource requests).",
    reconcileLoad: ' Of those, {polling} poll; {perHour} more follow every hour{breakdown}.',
    reconcileBreakdown: ' ({parts})',
    reconcilePart: '{label} × {http} = {perHour}/h',
    reconcileColId: '#',
    reconcileColEndpoint: 'Endpoint',
    reconcileColFilter: 'Network filter',
    reconcileColCount: 'Count',
    reconcileColOrigin: 'Origin',
    reconcileColUsedBy: 'Feeds',
    reconcileCount: '{n} {n|request|requests}',
    reconcileNoField: 'no field',
    reconcileNoFilter: 'not set',
    reconcileConditional: '{n} conditional {n|request|requests}: ',

    reportHeading: '## {title} punch list',
    reportSummary: 'Verified {done}/{total} · {problems} with problems',
    reportSection: '### {section} · {field}',
    reportAllPass: 'All checks passed; no field is marked as broken.',
    reportQuery: '- Query: {id} `{endpoint}` ({params})',
    reportQueryNone: '- Query: — (frontend generated)',
    reportResp: '- response: `{value}`',
    reportExpectValue: '- Expected value: {source} — {how}',
    reportExpectDisplay: '- Expected display: {display}',
    reportActual: '- Value on screen: `{value}`',
    reportFailed: '- Problem: {sides} ✗',
    reportNote: '- Note: {note}',

    toastCopied: 'Copied "{text}" — paste it into the Network filter',
    toastCopyFailed: 'Copy failed',
    toastReportCopied: 'Punch list copied as markdown',
    toastReportFailed: 'Copy failed — use the browser console instead',
    toastReset: 'All review marks cleared',
    confirmReset:
      'Clear every review mark? {done}/{total} are currently verified. This cannot be undone.',
    warnStorage: 'Cannot write to localStorage',

    joinList: ', ',
    joinSemi: '; ',
    joinMeta: ' · ',
  },
};
