/**
 * Cloudflare Pages Function: Idempotent Legacy Migration (Cloudinary Manifests -> Cloudflare D1)
 * Endpoint: POST /api/migrate-legacy
 */

import {
	jsonResponse,
	optionsResponse,
	isAuthorizedAdmin,
	fetchLegacyCloudinaryManifest,
	saveSessionsToD1,
	saveFramesToD1
} from './_utils/auth.js';

export async function onRequestOptions() {
	return optionsResponse('POST, OPTIONS');
}

export async function onRequestPost(context) {
	const { env, request } = context;

	if (!isAuthorizedAdmin(request, env)) {
		return jsonResponse({ success: false, error: 'Akses ditolak: Otorisasi admin diperlukan.' }, 401);
	}

	if (!env.DB) {
		return jsonResponse(
			{
				success: false,
				d1Unavailable: true,
				error: 'D1 database binding (DB) belum dikonfigurasi di Cloudflare Pages.'
			},
			503
		);
	}

	try {
		const [sessionsManifest, framesManifest] = await Promise.all([
			fetchLegacyCloudinaryManifest(env, 'sessions'),
			fetchLegacyCloudinaryManifest(env, 'frames')
		]);

		const legacySessions = Array.isArray(sessionsManifest?.sessions)
			? sessionsManifest.sessions
			: Array.isArray(sessionsManifest)
			? sessionsManifest
			: [];
		const legacyFrames = Array.isArray(framesManifest?.frames) ? framesManifest.frames : [];

		// Check current counts before import so we can report net newly imported rows
		const beforeSessionsRow = await env.DB.prepare('SELECT COUNT(*) as total FROM sessions').first();
		const beforeFramesRow = await env.DB.prepare('SELECT COUNT(*) as total FROM custom_frames').first();
		const beforeSessions = Number(beforeSessionsRow?.total || 0);
		const beforeFrames = Number(beforeFramesRow?.total || 0);

		if (legacySessions.length > 0) {
			await saveSessionsToD1(env.DB, legacySessions, { ignoreConflicts: true });
		}

		if (legacyFrames.length > 0) {
			await saveFramesToD1(env.DB, legacyFrames, { ignoreConflicts: true, replaceAll: false });
		}

		const afterSessionsRow = await env.DB.prepare('SELECT COUNT(*) as total FROM sessions').first();
		const afterFramesRow = await env.DB.prepare('SELECT COUNT(*) as total FROM custom_frames').first();
		const afterSessions = Number(afterSessionsRow?.total || 0);
		const afterFrames = Number(afterFramesRow?.total || 0);

		const importedSessions = Math.max(0, afterSessions - beforeSessions);
		const importedFrames = Math.max(0, afterFrames - beforeFrames);

		return jsonResponse({
			success: true,
			importedSessions,
			totalLegacySessions: legacySessions.length,
			skippedSessions: Math.max(0, legacySessions.length - importedSessions),
			importedFrames,
			totalLegacyFrames: legacyFrames.length,
			skippedFrames: Math.max(0, legacyFrames.length - importedFrames),
			totalSessionsInD1: afterSessions,
			totalFramesInD1: afterFrames
		});
	} catch (err) {
		console.error('[ApiMigrateLegacy] Error:', err);
		return jsonResponse({ success: false, error: err?.message || String(err) }, 500);
	}
}
