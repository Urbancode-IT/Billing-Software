import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build output and generated / copied files, as in .gitignore: linting them
  // buried the real problems under ~2,000 errors from minified code.
  globalIgnores(['dist', 'release-build', 'frontend/public/tesseract', 'backend/tools/docs-site/out', '.claude', 'data', '.cache', '.installer-cache']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // These flag what the React Compiler cannot optimise. The app does not
      // use the compiler, and the patterns work as written, so they are shown
      // as warnings to clean up over time, not errors that block a release.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/refs': 'warn',
      // Fast refresh in development only.
      'react-refresh/only-export-components': 'warn',
    },
  },
  // The server and the build / test scripts run in Node, not the browser.
  {
    files: [
      'backend/**/*.{js,mjs}',
      'backend/tools/scripts/**/*.{js,mjs}',
      'backend/tools/packaging/**/*.mjs',
      'backend/tools/installer/*.mjs',
      'backend/modules/utils/appHome.js',
      'backend/modules/utils/serverLock.js',
      'backend/modules/utils/setupDownload.js',
      'backend/modules/utils/phoneAccess.js',
      'backend/modules/utils/selfSignedCert.js',
      'backend/modules/utils/pairPage.js',
      'backend/tools/tests/**/*.{js,mjs}',
      'backend/tools/docs-site/*.mjs',
      'backend/tools/docs-site/pages/*.mjs',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
])
