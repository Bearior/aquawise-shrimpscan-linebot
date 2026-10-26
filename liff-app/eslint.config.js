import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // Screens keep small non-component helpers beside the component; this is
      // a dev-only Fast Refresh nicety, never a runtime concern.
      'react-refresh/only-export-components': 'warn',
      // A bare toLocale*() follows the DEVICE locale (a phone set to Burmese
      // renders Myanmar digits). Format through src/lib/format.ts instead.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[arguments.length=0] > MemberExpression.callee[property.name=/^toLocale(String|DateString|TimeString)$/]",
          message: 'Bare toLocale*() follows the device locale. Use src/lib/format.ts.',
        },
      ],
    },
  },
  {
    files: ['dev-mock/**/*.ts', 'vite.config.ts', 'vitest.config.ts', 'tests/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
])
