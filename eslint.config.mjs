import globals from 'globals';
import pluginJs from '@eslint/js';
import userscripts from 'eslint-plugin-userscripts';
import stylistic from '@stylistic/eslint-plugin';

export default [
  {
    languageOptions: {
      globals: globals.browser
    },
    plugins: {
      '@stylistic': stylistic,
    },
    ...pluginJs.configs.recommended,
    ...stylistic.configs['all-flat'],
    rules: {
      '@stylistic/brace-style': ['error', '1tbs'],
      '@stylistic/function-call-argument-newline': 'off',
      '@stylistic/keyword-spacing': ['error', { before: true }],
      '@stylistic/multiline-comment-style': 'off',
      '@stylistic/multiline-ternary': 'off',
      '@stylistic/newline-per-chained-call': 'off',
      '@stylistic/padded-blocks': 'off',
      '@stylistic/quote-props': ['error', 'as-needed'],
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/space-before-function-paren': ['error', 'never'],
      '@stylistic/spaced-comment': 'off',
      curly: ['error', 'all'],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
    }
  },
  {
    files: ['*.user.js'],
    plugins: {
      userscripts: {
        rules: userscripts.rules
      }
    },
    rules: {
      ...userscripts.configs.recommended.rules,
    },
    settings: {
      userscriptVersions: {
        greasemonkey: '*',
        tampermonkey: '*',
        violentmonkey: '*'
      }
    }
  }
];
