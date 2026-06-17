import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import js from '@eslint/js';
import ts from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'vite.config.ts']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
