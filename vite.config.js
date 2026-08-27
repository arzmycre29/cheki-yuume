import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const envPin =
	process.env.PUBLIC_ADMIN_PIN ||
	process.env.ADMIN_PIN ||
	process.env.VITE_ADMIN_PIN ||
	process.env.ADMIN_PASSWORD ||
	process.env.PASSWORD ||
	process.env.PIN ||
	'';

export default defineConfig({
	plugins: [
		sveltekit(),
		tailwindcss()
	],
	define: {
		'import.meta.env.PUBLIC_ADMIN_PIN': JSON.stringify(envPin)
	},
	server: {
		host: true,
		port: 5173
	}
});
