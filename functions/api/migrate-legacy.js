/**
 * Cloudflare Pages Function: Idempotent Legacy Migration (Cloudinary Manifests -> Cloudflare D1)
 * Endpoint: POST /api/migrate-legacy
 *
 * Filters out ghost records (empty sessionId) and verifies legacy session assets via lightweight HEAD
 * so explicitly deleted (404/410) sessions are skipped while active sessions are safely imported.
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

/**
 * Lightweight HEAD check on Cloudflare edge.
 * Returns 'deleted' ONLY on explicit 404/410; network errors/timeouts return 'unknown' (safe to keep).
 */
async function checkLegacyAssetHead(url, timeoutMs = 4000) {
	if (!url || typeof url !== 'string' || !url.startsWith('http')) {
		return 'unknown';
	}
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const res = await fetch(url, {
			method: 'HEAD',
			signal: controller.signal
		});
		clearTimeout(timer);

		if (res.status === 404 || res.status === 410) return 'deleted';
		if (res.ok) return 'exists';
		return 'unknown';
	} catch {
		return 'unknown';
	}
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

		const rawLegacySessions = Array.isArray(sessionsManifest?.sessions)
			? sessionsManifest.sessions
			: Array.isArray(sessionsManifest)
			? sessionsManifest
			: [];
		const legacyFrames = Array.isArray(framesManifest?.frames) ? framesManifest.frames : [];

		// 1. Filter out ghost records with empty/invalid sessionId
		const validLegacySessions = rawLegacySessions.filter(
			(s) => s && typeof s.sessionId === 'string' && s.sessionId.trim().length > 0
		);
		const skippedGhostSessions = rawLegacySessions.length - validLegacySessions.length;

		// 2. Skip sessions already confirmed deleted (404/410) on Cloudinary via lightweight HEAD
		const activeLegacySessions = [];
		let skippedDeletedSessions = 0;

		const batchSize = 10;
		for (let i = 0; i < validLegacySessions.length; i += batchSize) {
			const chunk = validLegacySessions.slice(i, i + batchSize);
			const results = await Promise.all(
				chunk.map(async (s) => {
					const checkUrl = s.photoUrl || s.videoUrl || s.manifestUrl || '';
					const status = await checkLegacyAssetHead(checkUrl, 4000);
					return { session: s, status };
				})
			);

			for (const r of results) {
				if (r.status === 'deleted') {
					skippedDeletedSessions++;
				} else {
					activeLegacySessions.push(r.session);
				}
			}
		}

		// 3. Check current counts before import so we can report net newly imported rows
		const beforeSessionsRow = await env.DB.prepare('SELECT COUNT(*) as total FROM sessions').first();
		const beforeFramesRow = await env.DB.prepare('SELECT COUNT(*) as total FROM custom_frames').first();
		const beforeSessions = Number(beforeSessionsRow?.total || 0);
		const beforeFrames = Number(beforeFramesRow?.total || 0);

		if (activeLegacySessions.length > 0) {
			await saveSessionsToD1(env.DB, activeLegacySessions, { ignoreConflicts: true });
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
			totalLegacySessions: validLegacySessions.length,
			skippedSessions: Math.max(0, activeLegacySessions.length - importedSessions),
			skippedDeletedSessions,
			skippedGhostSessions,
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
