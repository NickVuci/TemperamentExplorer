import globals from 'globals';

// Only catch undefined names and unused bindings; formatting is Prettier's job.
export default [
  {ignores: ['site/']},
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {...globals.browser, ...globals.node}
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', {args: 'none', caughtErrors: 'none', ignoreRestSiblings: true}]
    }
  },
  {
    files: ['src/sw.js'],
    languageOptions: {ecmaVersion: 'latest', sourceType: 'script', globals: globals.serviceworker},
    rules: {'no-undef': 'error', 'no-unused-vars': 'error'}
  }
];
