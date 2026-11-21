/**
 * Cloudflare Pages Function: Sessions D1 API
 * Endpoint: GET / POST / DELETE /api/sessions
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
	return optionsResponse('GET, POST, DELETE, OPTIONS');
}

export async function onRequestGet(context) {
	const { env, request } = context;
	const url = new URL(request.url);
	const targetSessionId = (url.searchParams.get('sessionId') || url.searchParams.get('id') || '').trim();

	// Single-session public lookup if ?id= or ?sessionId= is passed
	if (targetSessionId) {
		try {
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

			// Fallback to legacy Cloudinary manifest or tag lookup
			let found = null;
			const legacyManifest = await fetchLegacyCloudinaryManifest(env, 'sessions');
			if (Array.isArray(legacyManifest?.sessions)) {
				found = legacyManifest.sessions.find((s) => s && s.sessionId === targetSessionId) || null;
			}
			if (!found) {
				found = await findLegacySessionByTag(env, targetSessionId, url.host);
			}
			if (found && env.DB) {
				await saveSessionsToD1(env.DB, [found], { ignoreConflicts: true }).catch(() => {});
			}

			return jsonResponse({
				success: true,
				source: found ? 'legacy-fallback' : 'd1',
				sessionId: targetSessionId,
				session: found
			});
		} catch (err) {
			return jsonResponse({ success: false, error: err?.message || String(err) }, 500);
		}
	}

	// Admin-only full list query
	if (!isAuthorizedAdmin(request, env)) {
		return jsonResponse(
			{
				success: false,
				error: 'Akses ditolak: Otorisasi admin diperlukan untuk mengakses daftar sesi.'
			},
			401
		);
	}

	const limitParam = parseInt(url.searchParams.get('limit') || '1000', 10);
	const offsetParam = parseInt(url.searchParams.get('offset') || '0', 10);
	const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 5000) : 1000;
	const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;
	const search = (url.searchParams.get('q') || '').trim();

	try {
		if (env.DB) {
			let rows = [];
			if (search) {
				const likePattern = `%${search}%`;
				const res = await env.DB.prepare(
					'SELECT * FROM sessions WHERE session_id LIKE ? OR guest_name LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
				)
					.bind(likePattern, likePattern, limit, offset)
					.all();
				rows = res?.results || [];
			} else {
				const res = await env.DB.prepare(
					'SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?'
				)
					.bind(limit, offset)
					.all();
				rows = res?.results || [];

				// Auto-seed on first empty read from legacy Cloudinary manifest
				if (rows.length === 0 && offset === 0) {
					const legacy = await fetchLegacyCloudinaryManifest(env, 'sessions');
					const legacySessions = Array.isArray(legacy?.sessions)
						? legacy.sessions
						: Array.isArray(legacy)
						? legacy
						: [];
					if (legacySessions.length > 0) {
						await saveSessionsToD1(env.DB, legacySessions, { ignoreConflicts: true });
						const seededRes = await env.DB.prepare(
							'SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?'
						)
							.bind(limit, offset)
							.all();
						rows = seededRes?.results || [];
					}
				}
			}

			const countRow = await env.DB.prepare('SELECT COUNT(*) as total FROM sessions').first();
			const totalSessions = Number(countRow?.total ?? rows.length);

			return jsonResponse({
				success: true,
				source: 'd1',
				totalSessions,
				sessions: rows.map(mapRowToSession)
			});
		}

		// Fallback if DB binding is not yet attached in Cloudflare Pages
		const legacy = await fetchLegacyCloudinaryManifest(env, 'sessions');
		const list = Array.isArray(legacy?.sessions)
			? legacy.sessions
			: Array.isArray(legacy)
			? legacy
			: [];
		const filtered = search
			? list.filter(
					(s) =>
						s?.sessionId?.toLowerCase().includes(search.toLowerCase()) ||
						s?.guestName?.toLowerCase().includes(search.toLowerCase())
				)
			: list;

		return jsonResponse({
			success: true,
			source: 'cloudinary-fallback',
			totalSessions: filtered.length,
			sessions: filtered.slice(offset, offset + limit)
		});
	} catch (err) {
		console.error('[ApiSessions] GET error:', err);
		return jsonResponse({ success: false, error: err?.message || String(err) }, 500);
	}
}

export async function onRequestPost(context) {
	const { env, request } = context;

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
		const body = await request.json().catch(() => null);
		if (!body) {
			return jsonResponse({ success: false, error: 'Payload JSON tidak valid.' }, 400);
		}

		const incoming = Array.isArray(body.sessions) ? body.sessions : [body];
		const valid = incoming.filter(
			(s) => s && typeof s.sessionId === 'string' && s.sessionId.trim().length > 0
		);

		if (valid.length === 0) {
			return jsonResponse({ success: false, error: 'sessionId wajib diisi.' }, 400);
		}

		const count = await saveSessionsToD1(env.DB, valid, { ignoreConflicts: false });

		return jsonResponse({
			success: true,
			source: 'd1',
			count
		});
	} catch (err) {
		console.error('[ApiSessions] POST error:', err);
		return jsonResponse({ success: false, error: err?.message || String(err) }, 500);
	}
}

export async function onRequestDelete(context) {
	const { env, request } = context;

	if (!isAuthorizedAdmin(request, env)) {
		return jsonResponse({ success: false, error: 'Akses ditolak: Otorisasi admin diperlukan.' }, 401);
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
		const url = new URL(request.url);
		const queryId = (url.searchParams.get('id') || url.searchParams.get('sessionId') || '').trim();
		const body = await request.json().catch(() => ({}));
		const bodyIds = Array.isArray(body?.sessionIds) ? body.sessionIds : [];

		const idsToDelete = Array.from(
			new Set(
				[queryId, ...bodyIds]
					.filter((id) => typeof id === 'string' && id.trim().length > 0)
					.map((id) => id.trim())
			)
		);

		if (idsToDelete.length === 0) {
			return jsonResponse({ success: false, error: 'Tidak ada sessionId yang dikirim untuk dihapus.' }, 400);
		}

		const stmt = env.DB.prepare('DELETE FROM sessions WHERE session_id = ?');
		for (let i = 0; i < idsToDelete.length; i += 50) {
			await env.DB.batch(idsToDelete.slice(i, i + 50).map((id) => stmt.bind(id)));
		}

		return jsonResponse({
			success: true,
			source: 'd1',
			deletedCount: idsToDelete.length
		});
	} catch (err) {
		console.error('[ApiSessions] DELETE error:', err);
		return jsonResponse({ success: false, error: err?.message || String(err) }, 500);
	}
}
