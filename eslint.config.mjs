import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Жесткие правила для неиспользуемого кода
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-unused-vars': 'off', // Используем TypeScript версию
      'no-unreachable': 'error',
      'no-unreachable-loop': 'error',
      
      // Правила для чистоты кода
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      
      // Консистентность
      'prefer-const': 'warn',
      'no-var': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }], // Разрешены warn/error
      
      // Сложность кода
      'max-depth': ['warn', 4],
      'complexity': ['warn', 20], // Увеличено до 20
      'max-lines-per-function': ['warn', 200],
      'no-nested-ternary': 'warn',
      'max-params': ['warn', 5],
      'max-lines': ['warn', 1000],
      
      // Дополнительные правила
      'no-useless-return': 'warn',
      'no-useless-concat': 'warn',
      'no-useless-escape': 'warn',
      'prefer-template': 'warn',
      'prefer-arrow-callback': 'warn',
      'arrow-body-style': ['warn', 'as-needed'],
      'no-else-return': 'warn',
      'no-return-await': 'warn',
      'require-await': 'off', // Используем TypeScript версию
      'no-throw-literal': 'warn',
      'prefer-promise-reject-errors': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'old/**', 'clob-client/**', '*.js'],
  },
);

