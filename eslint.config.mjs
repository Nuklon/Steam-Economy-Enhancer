import globals from "globals";
import pluginJs from "@eslint/js";
import userscripts from 'eslint-plugin-userscripts';

export default [
  {
    languageOptions: {
      globals: globals.browser
    },
    files: ['*.user.js'],
    plugins: {
      userscripts: {
        rules: userscripts.rules
      }
    },
    rules: {
      ...userscripts.configs.recommended.rules,
      ...pluginJs.configs.recommended.rules,
      "no-var": "error",
      "prefer-const": "error",
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
