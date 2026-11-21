/**
 * Cloudflare Pages Function: Secure Admin PIN Verifier
 * Endpoint: POST /api/verify-pin
 *
 * Verifies a submitted admin PIN against environment variables server-side
 * without ever exposing the real secret PIN to client devices.
 */

import {
	getValidAdminPin,
	hasConfiguredEnvPin,
	jsonResponse,
	optionsResponse
} from './_utils/auth.js';

export async function onRequestPost(context) {
	const { env, request } = context;

	try {
		const body = await request.json().catch(() => ({}));
		const inputPin = String(body.pin || '').trim();

		const isValid = hasConfiguredEnvPin(env)
			? Boolean(inputPin && inputPin === getValidAdminPin(env))
			: Boolean(inputPin && (inputPin === '0509' || inputPin === '1234'));

		return jsonResponse({ success: true, valid: isValid }, 200, 'POST, OPTIONS');
	} catch (err) {
		return jsonResponse(
			{
				success: false,
				valid: false,
				error: 'Invalid request'
			},
			400,
			'POST, OPTIONS'
		);
	}
}

export async function onRequestOptions() {
	return optionsResponse('POST, OPTIONS');
}
