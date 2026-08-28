/**
 * Cloudflare Pages Function: Runtime Config Provider
 * Endpoint: GET /api/config
 * 
 * Safely exposes configured admin credentials and environment settings from
 * Cloudflare Pages runtime context.
 */

export async function onRequestGet(context) {
	const corsHeaders = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': '*',
		'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
		'Content-Type': 'application/json'
	};

	const { env } = context;

	// Check any possible naming variations of the admin password
	const adminPin =
		env.PUBLIC_ADMIN_PIN ||
		env.ADMIN_PIN ||
		env.VITE_ADMIN_PIN ||
		env.ADMIN_PASSWORD ||
		env.PASSWORD ||
		env.PIN ||
		'';

	return new Response(
		JSON.stringify({
			success: true,
			hasCustomPin: Boolean(adminPin && adminPin !== '1234'),
			adminPin: adminPin || null
		}),
		{
			status: 200,
			headers: corsHeaders
		}
	);
}

export async function onRequestOptions() {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': '*'
		}
	});
}
