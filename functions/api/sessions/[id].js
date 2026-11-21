/**
 * Cloudflare Pages Function: Single Session Lookup & Delete
 * Endpoint: GET / DELETE /api/sessions/:id
 */

import {
	jsonResponse,
	optionsResponse,
	isAuthorizedAdmin,
	fetchLegacyCloudinaryManifest,
	findLegacySessionByTag,
	mapRowToSession,
	saveSessionsToD1
} from '../_utils/auth.js';

export async function onRequestOptions() {
	return optionsResponse('GET, DELETE, OPTIONS');
}

export async function onRequestGet(context) {
	const { env, params, request } = context;
	const url = new URL(request.url);
	const targetSessionId = String(params?.id || '').trim();

	if (!targetSessionId) {
		return jsonResponse({ success: false, error: 'Parameter sessionId wajib diisi.' }, 400);
	}

	try {
		// 1. Primary fast lookup in Cloudflare D1
		if (env.DB) {
			const row = await env.DB.prepare('SELECT * FROM sessions WHERE session_id = ? LIMIT 1')
				.bind(targetSessionId)
				.first();

			if (row && (row.photo_url || row.video_url)) {
				return jsonResponse({
					success: true,
					source: 'd1',
					sessionId: targetSessionId,
					session: mapRowToSession(row)
				});
			}
		}

		// 2. Legacy Fallback & Self-Healing for pre-migration QR codes
		let found = null;
		const legacyManifest = await fetchLegacyCloudinaryManifest(env, 'sessions');
		const legacyList = Array.isArray(legacyManifest?.sessions)
			? legacyManifest.sessions
			: Array.isArray(legacyManifest)
			? legacyManifest
			: [];
		if (legacyList.length > 0) {
			found = legacyList.find((s) => s && s.sessionId === targetSessionId) || null;
		}

		if (!found) {
			found = await findLegacySessionByTag(env, targetSessionId, url.host);
		}

		// Self-heal: store into D1 so subsequent visits hit D1 directly
		if (found && env.DB) {
			await saveSessionsToD1(env.DB, [found], { ignoreConflicts: true }).catch((err) => {
				console.warn('[ApiSessionById] Self-heal D1 insert warning:', err);
			});
		}

		return jsonResponse({
			success: true,
			source: found ? 'legacy-fallback' : 'd1',
			sessionId: targetSessionId,
			session: found || null
		});
	} catch (err) {
		console.error('[ApiSessionById] GET error:', err);
		return jsonResponse({ success: false, error: err?.message || String(err) }, 500);
	}
}

export async function onRequestDelete(context) {
	const { env, params, request } = context;

	if (!isAuthorizedAdmin(request, env)) {
		return jsonResponse({ success: false, error: 'Akses ditolak: Otorisasi admin diperlukan.' }, 401);
	}

	const targetSessionId = String(params?.id || '').trim();
	if (!targetSessionId) {
		return jsonResponse({ success: false, error: 'Parameter sessionId wajib diisi.' }, 400);
	}

	if (!env.DB) {
		return jsonResponse(
			{
				success: false,
				d1Unavailable: true,
				error: 'D1 database binding (DB) belum dikonfigurasi.'
			},
			503
		);
	}

	try {
		await env.DB.prepare('DELETE FROM sessions WHERE session_id = ?').bind(targetSessionId).run();
		return jsonResponse({
			success: true,
			source: 'd1',
			sessionId: targetSessionId
		});
	} catch (err) {
		console.error('[ApiSessionById] DELETE error:', err);
		return jsonResponse({ success: false, error: err?.message || String(err) }, 500);
	}
}
