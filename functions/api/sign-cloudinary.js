/**
 * Cloudflare Pages Function: Cloudinary Upload Signature Generator
 * Endpoint: POST /api/sign-cloudinary
 * 
 * Generates an official Cloudinary SHA-1 signature using CLOUDINARY_API_SECRET
 * stored securely in Cloudflare Pages Environment Variables.
 */

// Helper to convert ArrayBuffer to Hex string
function bufToHex(buffer) {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function onRequestOptions() {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	});
}

export async function onRequestPost(context) {
	const corsHeaders = {
		'Access-Control-Allow-Origin': '*',
		'Content-Type': 'application/json'
	};

	try {
		const { env, request } = context;
		const apiSecret = env.CLOUDINARY_API_SECRET;
		const apiKey = env.CLOUDINARY_API_KEY;
		const cloudName = env.CLOUDINARY_CLOUD_NAME || 'qhdvucyw';

		if (!apiSecret || !apiKey) {
			console.warn('[SignCloudinary] CLOUDINARY_API_SECRET or CLOUDINARY_API_KEY is not configured in Cloudflare Pages');
			return new Response(
				JSON.stringify({
					success: false,
					error: 'CLOUDINARY_API_SECRET atau CLOUDINARY_API_KEY belum dikonfigurasi di Cloudflare Pages Environment Variables.'
				}),
				{ status: 500, headers: corsHeaders }
			);
		}

		let body = {};
		try {
			body = await request.json();
		} catch (_) {
			body = {};
		}

		// Security whitelist check: ensure uploads stay within chekiyuume application scope
		const folder = body.folder ? String(body.folder).replace(/^\/+|\/+$/g, '') : 'chekiyuume';
		if (!folder.startsWith('chekiyuume')) {
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Akses ditolak: Folder hanya diizinkan di dalam ruang lingkup chekiyuume.'
				}),
				{ status: 403, headers: corsHeaders }
			);
		}

		const timestamp = Math.round(Date.now() / 1000);

		// Parameters to sign in Cloudinary
		// Note: Cloudinary strictly requires alphabetical ordering of parameter names
		const paramsToSign = {};

		if (body.folder) paramsToSign.folder = folder;
		if (body.overwrite !== undefined) paramsToSign.overwrite = body.overwrite ? 'true' : 'false';
		if (body.public_id) paramsToSign.public_id = String(body.public_id);
		if (body.tags) {
			paramsToSign.tags = Array.isArray(body.tags) ? body.tags.join(',') : String(body.tags);
		}
		paramsToSign.timestamp = String(timestamp);

		// Sort keys alphabetically
		const sortedKeys = Object.keys(paramsToSign).sort();
		const serialized = sortedKeys
			.map((k) => `${k}=${paramsToSign[k]}`)
			.join('&');

		// Cloudinary signature formula: SHA1(serialized_params + api_secret)
		const stringToHash = `${serialized}${apiSecret}`;
		const encoder = new TextEncoder();
		const data = encoder.encode(stringToHash);
		const hashBuffer = await crypto.subtle.digest('SHA-1', data);
		const signature = bufToHex(hashBuffer);

		console.log(`[SignCloudinary] Successfully generated signature for public_id: "${body.public_id || 'unspecified'}"`);

		return new Response(
			JSON.stringify({
				success: true,
				signature,
				apiKey,
				timestamp,
				cloudName,
				params: paramsToSign
			}),
			{ status: 200, headers: corsHeaders }
		);
	} catch (err) {
		console.error('[SignCloudinary] Error generating signature:', err);
		return new Response(
			JSON.stringify({
				success: false,
				error: err?.message || 'Gagal menghasilkan tanda tangan Cloudinary.'
			}),
			{ status: 500, headers: corsHeaders }
		);
	}
}
