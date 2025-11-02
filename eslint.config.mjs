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
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn', // Может быть слишком строгим
      '@typescript-eslint/no-misused-promises': 'warn', // Может быть слишком строгим
      
      // Консистентность
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'off', // Разрешаем console для бота
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'old/**', 'clob-client/**', '*.js'],
  },
);

