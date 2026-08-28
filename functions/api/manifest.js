/**
 * Cloudflare Pages Function: Cloudinary Real-Time Manifest Provider
 * Endpoint: GET /api/manifest?type=frames|sessions
 * 
 * Fetches the latest asset metadata directly from Cloudinary Admin API using
 * CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET. This completely bypasses
 * Cloudinary CDN edge caching, ensuring all devices always receive the latest
 * versioned manifest URL.
 */

export async function onRequestGet(context) {
	const corsHeaders = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': '*',
		'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
		'Content-Type': 'application/json'
	};

	const { env, request } = context;
	const url = new URL(request.url);
	const type = url.searchParams.get('type') || 'frames';
	const filename = type === 'sessions' ? 'sessions_manifest.json' : 'frames_manifest.json';
	const publicId = `chekiyuume/${filename}`;

	const apiSecret = env.CLOUDINARY_API_SECRET;
	const apiKey = env.CLOUDINARY_API_KEY;
	const cloudName = env.CLOUDINARY_CLOUD_NAME || 'qhdvucyw';

	// If credentials are not set, fall back to fetching raw public URL
	if (!apiSecret || !apiKey) {
		console.warn('[ApiManifest] Cloudinary credentials not found in env, falling back to public URL');
		try {
			const fallbackUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}?_t=${Date.now()}`;
			const res = await fetch(fallbackUrl, { cache: 'no-store' });
			if (!res.ok) {
				return new Response(JSON.stringify({ success: false, status: res.status }), {
					status: res.status,
					headers: corsHeaders
				});
			}
			const data = await res.json();
			return new Response(JSON.stringify({ success: true, ...data }), {
				status: 200,
				headers: corsHeaders
			});
		} catch (err) {
			return new Response(JSON.stringify({ success: false, error: String(err) }), {
				status: 500,
				headers: corsHeaders
			});
		}
	}

	try {
		// 1. Query Cloudinary Admin API to get the exact real-time latest version & secure_url
		const authHeader = 'Basic ' + btoa(`${apiKey}:${apiSecret}`);
		const adminApiUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/raw/upload/${encodeURIComponent(publicId)}`;

		console.log(`[ApiManifest] Querying Cloudinary Admin API for "${publicId}"...`);
		const adminRes = await fetch(adminApiUrl, {
			headers: { Authorization: authHeader },
			cache: 'no-store'
		});

		if (!adminRes.ok) {
			if (adminRes.status === 404) {
				console.log(`[ApiManifest] Manifest "${publicId}" not found on Cloudinary (404).`);
				return new Response(
					JSON.stringify({
						success: true,
						version: '1.0',
						updatedAt: Date.now(),
						totalCustomFrames: 0,
						frames: [],
						totalSessions: 0,
						sessions: []
					}),
					{ status: 200, headers: corsHeaders }
				);
			}

			// If admin API returns other error (e.g. rate limit), fall back to public URL
			console.warn(`[ApiManifest] Admin API returned HTTP ${adminRes.status}, falling back to public fetch.`);
			const fallbackUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}?_t=${Date.now()}`;
			const fbRes = await fetch(fallbackUrl, { cache: 'no-store' });
			const fbData = await fbRes.json();
			return new Response(JSON.stringify({ success: true, ...fbData }), {
				status: 200,
				headers: corsHeaders
			});
		}

		const resourceData = await adminRes.json();
		const secureUrl = resourceData.secure_url;
		const version = resourceData.version;

		console.log(`[ApiManifest] Found exact latest version from Cloudinary: v${version}`);

		// 2. Fetch the content directly using the immutable versioned URL
		const contentRes = await fetch(secureUrl, { cache: 'no-store' });
		if (!contentRes.ok) {
			throw new Error(`Failed to fetch versioned content from ${secureUrl} (HTTP ${contentRes.status})`);
		}

		const manifestJson = await contentRes.json();

		// If sessions requested, dynamically discover all individual session manifests & photostrips
		if (type === 'sessions' && apiKey && apiSecret) {
			try {
				const sessionMap = new Map();
				if (manifestJson.sessions && Array.isArray(manifestJson.sessions)) {
					manifestJson.sessions.forEach((s) => sessionMap.set(s.sessionId, s));
				}

				// Search for any individual manifest.json files in chekiyuume/sessions/
				const listRawUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/raw/upload?prefix=chekiyuume/sessions/&max_results=500`;
				const rawListRes = await fetch(listRawUrl, { headers: { Authorization: authHeader }, cache: 'no-store' });
				if (rawListRes.ok) {
					const rawData = await rawListRes.json();
					if (rawData.resources && Array.isArray(rawData.resources)) {
						for (const resItem of rawData.resources) {
							if (resItem.public_id.endsWith('/manifest.json') || resItem.public_id.endsWith('/manifest')) {
								try {
									const mRes = await fetch(resItem.secure_url, { cache: 'no-store' });
									if (mRes.ok) {
										const mJson = await mRes.json();
										if (mJson && mJson.sessionId && !sessionMap.has(mJson.sessionId)) {
											sessionMap.set(mJson.sessionId, {
												sessionId: mJson.sessionId,
												guestName: mJson.guestName || '',
												mode: mJson.mode || 'default',
												layoutId: mJson.layoutId || 'default-4-classic',
												photoUrl: mJson.photoUrl || undefined,
												videoUrl: mJson.videoUrl || undefined,
												shareUrl: mJson.shareUrl || undefined,
												manifestUrl: resItem.secure_url,
												photosCount: mJson.photosCount || 4,
												printCount: mJson.printCount || 0,
												createdAt: mJson.createdAt || new Date(resItem.created_at).getTime()
											});
										}
									}
								} catch (_) {}
							}
						}
					}
				}

				// Also search for any photostrips in chekiyuume/sessions/
				const listImagesUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?prefix=chekiyuume/sessions/&max_results=500`;
				const imgListRes = await fetch(listImagesUrl, { headers: { Authorization: authHeader }, cache: 'no-store' });
				if (imgListRes.ok) {
					const imgData = await imgListRes.json();
					if (imgData.resources && Array.isArray(imgData.resources)) {
						for (const imgItem of imgData.resources) {
							const match = imgItem.public_id.match(/(CKY-\d{8}-\d{6}-[A-Z0-9]+)/);
							if (match) {
								const sId = match[1];
								if (!sessionMap.has(sId)) {
									const folderParts = imgItem.public_id.split('/');
									const folderName = folderParts.length > 2 ? folderParts[2] : '';
									const guestName = folderName.replace(`_${sId}`, '').replace(/_/g, ' ') || 'Tamu';
									sessionMap.set(sId, {
										sessionId: sId,
										guestName: guestName,
										mode: 'default',
										layoutId: 'default-4-classic',
										photoUrl: imgItem.secure_url,
										shareUrl: `https://cheki-yuume.pages.dev/share/${sId}`,
										photosCount: 4,
										printCount: 0,
										createdAt: new Date(imgItem.created_at).getTime()
									});
								}
							}
						}
					}
				}

				const mergedList = Array.from(sessionMap.values()).sort((a, b) => b.createdAt - a.createdAt);
				manifestJson.totalSessions = mergedList.length;
				manifestJson.sessions = mergedList;
			} catch (scanErr) {
				console.warn('[ApiManifest] Error scanning session folders:', scanErr);
			}
		}

		return new Response(
			JSON.stringify({
				success: true,
				version: manifestJson.version || '1.0',
				updatedAt: manifestJson.updatedAt || Date.now(),
				cloudVersion: version,
				secureUrl,
				...manifestJson
			}),
			{ status: 200, headers: corsHeaders }
		);
	} catch (err) {
		console.error('[ApiManifest] Error fetching real-time manifest:', err);
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
			'Access-Control-Allow-Headers': '*'
		}
	});
}
