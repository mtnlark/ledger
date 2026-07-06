import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

export default ts.config(
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'node_modules/',
			'src-tauri/target/',
			'coverage/',
			'tools/'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		plugins: { 'unused-imports': unusedImports }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: { parser: ts.parser }
		},
		rules: {
			// Bare identifiers inside $effect/$derived are rune dependency tracking
			'@typescript-eslint/no-unused-expressions': 'off'
		}
	},
	{
		rules: {
			// Auto-fixable removal of dead imports
			'unused-imports/no-unused-imports': 'error',
			// Allow intentionally-unused values when prefixed with _
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
					caughtErrors: 'none'
				}
			],
			// The svelte compiler (via svelte-check) validates these ignores;
			// this plugin can't see compiler-level a11y warnings and flags them all
			'svelte/no-unused-svelte-ignore': 'off',
			// Desktop app with no configurable base path; resolve() adds nothing
			'svelte/no-navigation-without-resolve': 'off',
			// Surfaced as warnings: fixing requires per-site semantic decisions
			// (each keys) or reactivity-class migration (SvelteMap/SvelteSet)
			'svelte/require-each-key': 'warn',
			'svelte/prefer-svelte-reactivity': 'warn'
		}
	},
	{
		// Tests stub complex shapes; any is acceptable there
		files: ['**/*.test.ts', 'src/tests/**'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off'
		}
	},
	{
		// Ambient declaration names are consumed by the compiler, not code
		files: ['**/*.d.ts'],
		rules: {
			'@typescript-eslint/no-unused-vars': 'off'
		}
	}
);
