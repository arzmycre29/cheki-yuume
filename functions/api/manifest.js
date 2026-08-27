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
		'Access-Control-Allow-Headers': 'Content-Type',
		'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
		'Content-Type': 'application/json'
	};

	const { env, request } = context;
	const url = new URL(request.url);
	const type = url.searchParams.get('type') || 'frames';
	const filename = type === 'sessions' ? 'sessions_manifest.json' : 'frames_manifest.json';
	const publicId = chekiyuume/;

	const apiSecret = env.CLOUDINARY_API_SECRET;
	const apiKey = env.CLOUDINARY_API_KEY;
	const cloudName = env.CLOUDINARY_CLOUD_NAME || 'qhdvucyw';

	// If credentials are not set, fall back to fetching raw public URL
	if (!apiSecret || !apiKey) {
		console.warn('[ApiManifest] Cloudinary credentials not found in env, falling back to public URL');
		try {
			const fallbackUrl = https://res.cloudinary.com//raw/upload/?_t=;
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
		const authHeader = 'Basic ' + btoa(${apiKey}:);
		const adminApiUrl = https://api.cloudinary.com/v1_1//resources/raw/upload/;

		console.log([ApiManifest] Querying Cloudinary Admin API for "...);
 const adminRes = await fetch(adminApiUrl, {
 headers: { Authorization: authHeader },
 cache: 'no-store'
 });

 if (!adminRes.ok) {
 if (adminRes.status === 404) {
 console.log([ApiManifest] Manifest  not found on Cloudinary (404).);
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
 console.warn([ApiManifest] Admin API returned HTTP , falling back to public fetch.);
 const fallbackUrl = https://res.cloudinary.com//raw/upload/?_t=;
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

 console.log([ApiManifest] Found exact latest version from Cloudinary: v);

 // 2. Fetch the content directly using the immutable versioned URL
 const contentRes = await fetch(secureUrl, { cache: 'no-store' });
 if (!contentRes.ok) {
 throw new Error(Failed to fetch versioned content from (HTTP ));
 }

 const manifestJson = await contentRes.json();
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
 'Access-Control-Allow-Headers': 'Content-Type'
 }
 });
}
