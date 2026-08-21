/**
 * ESLint 只負責 prettier 管不到的事：**會出錯的寫法**，不是排版。
 *
 * 重點在 `src/assets/app.js`——867 行手寫 DOM 字串拼接，是整個專案最缺護欄的地方，
 * 而它既不在 tsconfig 裡（拿不到型別檢查），也沒有執行期以外的驗證。
 */

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** 不由人手寫、或不該被檢查的東西。 */
const IGNORES = ['dist/', 'examples/*.html', 'examples/*.md', 'coverage/'];

export default tseslint.config(
  { ignores: IGNORES },

  // ── TypeScript：src/ 與 tests/ ──
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['src/**/*.ts', 'tests/**/*.ts', '*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // 型別已經擋住大部分；這裡留下真正會咬人的
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off', // CLI 的輸出就是它的介面
      'prefer-const': 'error',
    },
  },

  // ── 測試：斷言用的 `!` 是刻意的，資料工廠回傳的東西型別上可為 undefined ──
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // ── 驗收介面：瀏覽器環境的手寫 JS，沒有型別可倚靠 ──
  {
    extends: [js.configs.recommended],
    files: ['src/assets/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      sourceType: 'script',
    },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-implicit-globals': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // ── 設定檔自己 ──
  {
    files: ['eslint.config.js', 'vitest.config.ts'],
    languageOptions: { globals: globals.node },
  },
);
