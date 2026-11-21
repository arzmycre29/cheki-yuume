/**
 * Cloudflare Pages Function: Real-Time Manifest Provider (D1-First with Cloudinary Compatibility Fallback)
 * Endpoint: GET /api/manifest?type=frames|sessions&id=CKY-...&pin=...
 */

import {
	jsonResponse,
	optionsResponse,
	isAuthorizedAdmin,
	getCloudinaryConfig,
	fetchLegacyCloudinaryManifest,
	findLegacySessionByTag,
	mapRowToSession,
	saveSessionsToD1,
	saveFramesToD1
} from './_utils/auth.js';

export async function onRequestOptions() {
	return optionsResponse('GET, OPTIONS');
}

export async function onRequestGet(context) {
	const { env, request } = context;
	const url = new URL(request.url);
	const type = url.searchParams.get('type') || 'frames';
	const targetSessionId = (url.searchParams.get('sessionId') || url.searchParams.get('id') || '').trim();

	// Privacy Gate: If someone requests all sessions without specifying a target sessionId,
	// they MUST provide valid admin credentials.
	if (type === 'sessions' && !targetSessionId && !isAuthorizedAdmin(request, env)) {
		return jsonResponse(
			{
				success: false,
				error: 'Akses ditolak: Parameter sessionId atau otorisasi admin diperlukan untuk melindungi privasi pengunjung.'
			},
			401,
			'GET, OPTIONS'
		);
	}

	try {
		// 1. D1-First Path
		if (env.DB) {
			if (type === 'sessions' && targetSessionId) {
				const row = await env.DB.prepare('SELECT * FROM sessions WHERE session_id = ? LIMIT 1')
					.bind(targetSessionId)
					.first();
				if (row && (row.photo_url || row.video_url)) {
					return jsonResponse(
						{
							success: true,
							source: 'd1',
							sessionId: targetSessionId,
							session: mapRowToSession(row)
						},
						200,
						'GET, OPTIONS'
					);
				}
			} else if (type === 'sessions') {
				const res = await env.DB.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1000').all();
				const rows = res?.results || [];
				if (rows.length > 0) {
					const sessions = rows.map(mapRowToSession);
					return jsonResponse(
						{
							success: true,
							source: 'd1',
							version: '1.0',
							updatedAt: Date.now(),
							totalSessions: sessions.length,
							sessions
						},
						200,
						'GET, OPTIONS'
					);
				}
			} else {
				const res = await env.DB.prepare('SELECT layout_json FROM custom_frames ORDER BY updated_at DESC').all();
				const rows = res?.results || [];
				if (rows.length > 0) {
					const frames = [];
					for (const r of rows) {
						try {
							const parsed = JSON.parse(r.layout_json);
							if (parsed && parsed.id) frames.push(parsed);
						} catch (_) {}
					}
					return jsonResponse(
						{
							success: true,
							source: 'd1',
							version: '1.0',
							updatedAt: Date.now(),
							totalCustomFrames: frames.length,
							frames
						},
						200,
						'GET, OPTIONS'
					);
				}
			}
		}

		// 2. Legacy Cloudinary Fallback (if D1 is empty or not bound yet)
		const legacyData = await fetchLegacyCloudinaryManifest(env, type === 'sessions' ? 'sessions' : 'frames');
		const manifestJson = legacyData || {
			version: '1.0',
			updatedAt: Date.now(),
			frames: [],
			sessions: []
		};

		if (type === 'sessions' && targetSessionId) {
			const sessions = Array.isArray(manifestJson.sessions) ? manifestJson.sessions : [];
			let found = sessions.find((s) => s && s.sessionId === targetSessionId) || null;

			if (!found || (!found.photoUrl && !found.videoUrl)) {
				const byTag = await findLegacySessionByTag(env, targetSessionId, url.host);
				if (byTag) found = byTag;
			}

			if (found && env.DB) {
				await saveSessionsToD1(env.DB, [found], { ignoreConflicts: true }).catch(() => {});
			}

			return jsonResponse(
				{
					success: true,
					source: 'cloudinary-fallback',
					sessionId: targetSessionId,
					session: found
				},
				200,
				'GET, OPTIONS'
			);
		}

		if (type === 'sessions' && Array.isArray(manifestJson.sessions) && manifestJson.sessions.length > 0 && env.DB) {
			await saveSessionsToD1(env.DB, manifestJson.sessions, { ignoreConflicts: true }).catch(() => {});
		}
		if (type !== 'sessions' && Array.isArray(manifestJson.frames) && manifestJson.frames.length > 0 && env.DB) {
			await saveFramesToD1(env.DB, manifestJson.frames, { ignoreConflicts: true }).catch(() => {});
		}

		const { cloudName } = getCloudinaryConfig(env);
		return jsonResponse(
			{
				success: true,
				source: cloudName ? 'cloudinary-fallback' : 'empty',
				...manifestJson
			},
			200,
			'GET, OPTIONS'
		);
	} catch (err) {
		console.error('[ApiManifest] Error handling manifest request:', err);
		return jsonResponse(
			{
				success: false,
				error: err?.message || String(err)
			},
			500,
			'GET, OPTIONS'
		);
	}
}
