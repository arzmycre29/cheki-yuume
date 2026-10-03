/**
 * Cloudflare Pages Function: Cloudinary Real-Time Manifest Provider
 * Endpoint: GET /api/manifest?type=frames|sessions&id=CKY-...&pin=...
 * 
 * Fetches asset metadata with strict privacy controls:
 * - Frames: Publicly available for photobooth frame selection.
 * - Sessions with ?id= / ?sessionId=: Publicly returns ONLY the requested session's media,
 *   strictly hiding all other visitors' sessions.
 * - Sessions without ?id=: Protected. Requires valid Admin PIN in x-admin-pin header or ?pin= query.
 */

export async function onRequestGet(context) {
	const corsHeaders = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Accept, x-admin-pin',
		'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
		'Content-Type': 'application/json'
	};

	const { env, request } = context;
	const url = new URL(request.url);
	const type = url.searchParams.get('type') || 'frames';
	const targetSessionId = (url.searchParams.get('sessionId') || url.searchParams.get('id') || '').trim();

	const apiSecret = env.CLOUDINARY_API_SECRET;
	const apiKey = env.CLOUDINARY_API_KEY;
	const cloudName = env.CLOUDINARY_CLOUD_NAME || env.PUBLIC_CLOUDINARY_CLOUD_NAME || 'qhdvucyw';

	// Determine admin authorization for unrestricted manifest queries
	const providedPin = request.headers.get('x-admin-pin') || url.searchParams.get('pin');
	const validAdminPin = (
		env.PUBLIC_ADMIN_PIN ||
		env.ADMIN_PIN ||
		env.VITE_ADMIN_PIN ||
		env.ADMIN_PASSWORD ||
		env.PASSWORD ||
		env.PIN ||
		'1234'
	).trim();
	const isAuthorizedAdmin = Boolean(providedPin && providedPin.trim() === validAdminPin);

	// Privacy Gate: If someone requests all sessions without specifying a target sessionId,
	// they MUST provide valid admin credentials.
	if (type === 'sessions' && !targetSessionId && !isAuthorizedAdmin) {
		return new Response(
			JSON.stringify({
				success: false,
				error: 'Akses ditolak: Parameter sessionId atau otorisasi admin diperlukan untuk melindungi privasi pengunjung.'
			}),
			{ status: 401, headers: corsHeaders }
		);
	}

	const filename = type === 'sessions' ? 'sessions_manifest.json' : 'frames_manifest.json';
	const publicId = `chekiyuume/${filename}`;

	// Helper to send safe filtered session response
	const sendSessionResponse = (manifestData) => {
		if (targetSessionId) {
			const sessions = Array.isArray(manifestData?.sessions) ? manifestData.sessions : [];
			const found = sessions.find((s) => s && s.sessionId === targetSessionId);
			return new Response(
				JSON.stringify({
					success: true,
					sessionId: targetSessionId,
					session: found || null
				}),
				{ status: 200, headers: corsHeaders }
			);
		}

		return new Response(
			JSON.stringify({
				success: true,
				...manifestData
			}),
			{ status: 200, headers: corsHeaders }
		);
	};

	// 1. Fallback / Public CDN path if Cloudinary API credentials are not set
	if (!apiSecret || !apiKey) {
		try {
			const fallbackUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}?_t=${Date.now()}`;
			const res = await fetch(fallbackUrl, { cache: 'no-store' });
			if (!res.ok) {
				if (targetSessionId) {
					return new Response(
						JSON.stringify({ success: true, sessionId: targetSessionId, session: null }),
						{ status: 200, headers: corsHeaders }
					);
				}
				return new Response(
					JSON.stringify({ success: false, status: res.status }),
					{ status: res.status, headers: corsHeaders }
				);
			}
			const data = await res.json();
			return type === 'sessions' ? sendSessionResponse(data) : new Response(JSON.stringify({ success: true, ...data }), { status: 200, headers: corsHeaders });
		} catch (err) {
			return new Response(
				JSON.stringify({ success: false, error: String(err) }),
				{ status: 500, headers: corsHeaders }
			);
		}
	}

	// 2. Authenticated Cloudinary flow
	try {
		const authHeader = 'Basic ' + btoa(`${apiKey}:${apiSecret}`);

		// Fast Path for specific sessionId: Check tag directly first if desired or query manifest
		const adminApiUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/raw/upload/${encodeURIComponent(publicId)}`;
		const adminRes = await fetch(adminApiUrl, {
			headers: { Authorization: authHeader },
			cache: 'no-store'
		});

		let manifestJson = null;

		if (adminRes.ok) {
			const resourceData = await adminRes.json();
			const secureUrl = resourceData.secure_url;
			const contentRes = await fetch(secureUrl, { cache: 'no-store' });
			if (contentRes.ok) {
				manifestJson = await contentRes.json();
			}
		} else {
			// Fallback to public CDN URL
			const fallbackUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}?_t=${Date.now()}`;
			const fbRes = await fetch(fallbackUrl, { cache: 'no-store' });
			if (fbRes.ok) {
				manifestJson = await fbRes.json();
			}
		}

		if (!manifestJson) {
			manifestJson = {
				success: true,
				version: '1.0',
				updatedAt: Date.now(),
				frames: [],
				sessions: []
			};
		}

		// If looking for a specific sessionId:
		if (type === 'sessions' && targetSessionId) {
			const sessions = Array.isArray(manifestJson.sessions) ? manifestJson.sessions : [];
			let found = sessions.find((s) => s && s.sessionId === targetSessionId);

			// If not yet in central manifest, perform 1 lightweight tag search on Cloudinary
			if (!found || (!found.photoUrl && !found.videoUrl)) {
				try {
					const tagUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/by_tag/${encodeURIComponent(targetSessionId)}`;
					const tagRes = await fetch(tagUrl, {
						headers: { Authorization: authHeader },
						cache: 'no-store'
					});
					if (tagRes.ok) {
						const tagData = await tagRes.json();
						if (tagData.resources && Array.isArray(tagData.resources) && tagData.resources.length > 0) {
							let pUrl = null;
							let vUrl = null;
							for (const r of tagData.resources) {
								if (r.resource_type === 'image' || r.format === 'png' || r.format === 'jpg') {
									pUrl = r.secure_url;
								} else if (r.resource_type === 'video' || r.format === 'mp4') {
									vUrl = r.secure_url;
								}
							}
							if (pUrl || vUrl) {
								found = {
									sessionId: targetSessionId,
									guestName: 'Tamu',
									photoUrl: pUrl,
									videoUrl: vUrl,
									shareUrl: `https://${url.host}/share/${targetSessionId}`,
									createdAt: Date.now()
								};
							}
						}
					}
				} catch (tagErr) {
					console.warn('[ApiManifest] Tag lookup warning:', tagErr);
				}
			}

			// Return ONLY this single session
			return new Response(
				JSON.stringify({
					success: true,
					sessionId: targetSessionId,
					session: found || null
				}),
				{ status: 200, headers: corsHeaders }
			);
		}

		// If type is sessions and user IS admin:
		if (type === 'sessions' && isAuthorizedAdmin) {
			return new Response(
				JSON.stringify({
					success: true,
					...manifestJson
				}),
				{ status: 200, headers: corsHeaders }
			);
		}

		// For type === 'frames' (public frames catalogue)
		return new Response(
			JSON.stringify({
				success: true,
				...manifestJson
			}),
			{ status: 200, headers: corsHeaders }
		);

	} catch (err) {
		console.error('[ApiManifest] Error handling manifest request:', err);
		return new Response(
			JSON.stringify({
				success: false,
				error: err.message || String(err)
			}),
			{ status: 500, headers: corsHeaders }
		);
	}
}

export async function onRequestOptions() {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Accept, x-admin-pin'
		}
	});
}
