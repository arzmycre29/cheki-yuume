/**
 * Cloudflare Pages Function: Secure Admin PIN Verifier
 * Endpoint: POST /api/verify-pin
 * 
 * Verifies a submitted admin PIN against environment variables server-side
 * without ever exposing the real secret PIN to client devices.
 */

export async function onRequestPost(context) {
	const corsHeaders = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Accept',
		'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
		'Content-Type': 'application/json'
	};

	const { env, request } = context;

	try {
		const body = await request.json().catch(() => ({}));
		const inputPin = String(body.pin || '').trim();

		const validPin = (
			env.PUBLIC_ADMIN_PIN ||
			env.ADMIN_PIN ||
			env.VITE_ADMIN_PIN ||
			env.ADMIN_PASSWORD ||
			env.PASSWORD ||
			env.PIN ||
			'1234'
		).trim();

		const isValid = Boolean(inputPin && inputPin === validPin);

		return new Response(
			JSON.stringify({
				success: true,
				valid: isValid
			}),
			{
				status: 200,
				headers: corsHeaders
			}
		);
	} catch (err) {
		return new Response(
			JSON.stringify({
				success: false,
				valid: false,
				error: 'Invalid request'
			}),
			{
				status: 400,
				headers: corsHeaders
			}
		);
	}
}

export async function onRequestOptions() {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Accept'
		}
	});
}
