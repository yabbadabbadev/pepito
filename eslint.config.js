import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import reactRefreshPlugin from 'eslint-plugin-react-refresh'
import vitestGlobals from 'eslint-plugin-vitest-globals'
import globals from 'globals'

// Config adaptada del boilerplate interno de referencia para que resulte
// reconocible a quien venga de esos proyectos. Diferencias deliberadas
// anotadas más abajo.

export default [
  // Ignores globales: en flat config, un `ignores` co-ubicado con `files` solo
  // aplica a ese bloque. El boilerplate lo lleva dentro del bloque principal y
  // le funciona porque solo linta `src`; aquí lintamos el repo entero.
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '**/public/**',
      '**/__screenshots__/**',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    settings: {
      react: {
        // 'detect' requiere react instalado junto a la config; se fija la
        // versión a mano en vez de depender de esa resolución.
        version: '19.2',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'react-refresh/only-export-components': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'prettier/prettier': 'error',
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Deben ir DESPUÉS del spread: recommended vuelve a activar reglas que el
      // bloque anterior apaga, y en flat config gana el último bloque.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Augmentación de módulos: las interfaces vacías son el mecanismo, no un
    // descuido.
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    // Scripts de Node sueltos, si los hubiera. El bloque principal solo cubre
    // js/jsx/ts/tsx, así que los .mjs se lintarían sin globals y cada `process`
    // o `console` caería en no-undef.
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.test.{ts,tsx,js,jsx}', '**/test/**/*'],
    languageOptions: {
      globals: {
        ...vitestGlobals.environments.env.globals,
      },
    },
  },
  prettierConfig,
]
