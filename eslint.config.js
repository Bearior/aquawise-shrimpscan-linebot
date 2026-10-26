import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  {
    ignores: ['dist/**', 'public/**', 'liff-app/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Bare console.* can leak LINE user ids and tokens. Log through the
      // redacting logger; it is the one sink allowed below.
      'no-console': 'error',
    },
  },
  {
    files: ['src/lib/logger.ts', 'scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
]
