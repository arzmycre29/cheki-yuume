/**
 * Cloudflare Pages Function: Custom Frames D1 API
 * Endpoint: GET / POST / DELETE /api/frames
 */

import {
	jsonResponse,
	optionsResponse,
	isAuthorizedAdmin,
	fetchLegacyCloudinaryManifest,
	normalizeFrameName,
	saveFramesToD1
} from '../_utils/auth.js';

export async function onRequestOptions() {
	return optionsResponse('GET, POST, DELETE, OPTIONS');
}

export async function onRequestGet(context) {
	const { env } = context;

	try {
		if (env.DB) {
			let rows = (
				await env.DB.prepare('SELECT layout_json FROM custom_frames ORDER BY updated_at DESC').all()
			)?.results || [];

			// Auto-seed from legacy Cloudinary frames_manifest.json on first empty read
			if (rows.length === 0) {
				const legacy = await fetchLegacyCloudinaryManifest(env, 'frames');
				const legacyFrames = Array.isArray(legacy?.frames) ? legacy.frames : [];
				if (legacyFrames.length > 0) {
					await saveFramesToD1(env.DB, legacyFrames, { ignoreConflicts: true });
					rows = (
						await env.DB.prepare('SELECT layout_json FROM custom_frames ORDER BY updated_at DESC').all()
					)?.results || [];
				}
			}

			const frames = [];
			for (const r of rows) {
				try {
					const parsed = JSON.parse(r.layout_json);
					if (parsed && parsed.id) frames.push(parsed);
				} catch (_) {}
			}

			return jsonResponse({
				success: true,
				source: 'd1',
				count: frames.length,
				frames
			});
		}

		// Fallback if DB binding is not yet attached
		const legacy = await fetchLegacyCloudinaryManifest(env, 'frames');
		const legacyFrames = Array.isArray(legacy?.frames) ? legacy.frames : [];
		return jsonResponse({
			success: true,
			source: 'cloudinary-fallback',
			count: legacyFrames.length,
			frames: legacyFrames
		});
	} catch (err) {
		console.error('[ApiFrames] GET error:', err);
		return jsonResponse({ success: false, error: err?.message || String(err) }, 500);
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

		const incoming = Array.isArray(body.frames)
			? body.frames
			: body.frame
			? [body.frame]
			: [];
		const replaceAll = body.replaceAll === true;

		const saved = await saveFramesToD1(env.DB, incoming, {
			ignoreConflicts: false,
			replaceAll
		});

		return jsonResponse({
			success: true,
			source: 'd1',
			count: saved.length,
			frames: saved
		});
	} catch (err) {
		console.error('[ApiFrames] POST error:', err);
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
		const deleteAll = url.searchParams.get('all') === 'true';
		const frameId = (url.searchParams.get('id') || '').trim();
		const frameName = (url.searchParams.get('name') || '').trim();

		if (deleteAll) {
			await env.DB.prepare('DELETE FROM custom_frames').run();
			return jsonResponse({ success: true, source: 'd1', clearedAll: true });
		}

		if (frameId) {
			await env.DB.prepare('DELETE FROM custom_frames WHERE id = ?').bind(frameId).run();
			return jsonResponse({ success: true, source: 'd1', deletedId: frameId });
		}

		if (frameName) {
			await env.DB.prepare('DELETE FROM custom_frames WHERE normalized_name = ?')
				.bind(normalizeFrameName(frameName))
				.run();
			return jsonResponse({ success: true, source: 'd1', deletedName: frameName });
		}

		return jsonResponse({ success: false, error: 'Parameter id, name, atau all=true diperlukan.' }, 400);
	} catch (err) {
		console.error('[ApiFrames] DELETE error:', err);
		return jsonResponse({ success: false, error: err?.message || String(err) }, 500);
	}
}
