/**
 * Shared utilities for Cloudflare Pages Functions (CORS, Admin Auth, D1 Mappers, Legacy Cloudinary Bridge)
 */

export function getCorsHeaders(methods = 'GET, POST, DELETE, OPTIONS') {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': methods,
		'Access-Control-Allow-Headers': 'Content-Type, Accept, x-admin-pin',
		'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
		'Content-Type': 'application/json'
	};
}

export function jsonResponse(data, status = 200, methods = 'GET, POST, DELETE, OPTIONS') {
	return new Response(JSON.stringify(data), {
		status,
		headers: getCorsHeaders(methods)
	});
}

export function optionsResponse(methods = 'GET, POST, DELETE, OPTIONS') {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': methods,
			'Access-Control-Allow-Headers': 'Content-Type, Accept, x-admin-pin'
		}
	});
}

export function hasConfiguredEnvPin(env) {
	return Boolean(
		env?.PUBLIC_ADMIN_PIN ||
			env?.ADMIN_PIN ||
			env?.VITE_ADMIN_PIN ||
			env?.ADMIN_PASSWORD ||
			env?.PASSWORD ||
			env?.PIN
	);
}

export function getValidAdminPin(env) {
	return String(
		env?.PUBLIC_ADMIN_PIN ||
			env?.ADMIN_PIN ||
			env?.VITE_ADMIN_PIN ||
			env?.ADMIN_PASSWORD ||
			env?.PASSWORD ||
			env?.PIN ||
			'0509'
	).trim();
}

export function isAuthorizedAdmin(request, env) {
	const url = new URL(request.url);
	const providedPin = (
		request.headers.get('x-admin-pin') ||
		url.searchParams.get('pin') ||
		''
	).trim();

	if (!providedPin) return false;

	if (hasConfiguredEnvPin(env)) {
		return providedPin === getValidAdminPin(env);
	}

	// When no custom PIN env var is configured on Cloudflare Pages, accept default PINs ('0509' or legacy '1234')
	return providedPin === '0509' || providedPin === '1234';
}

export function getCloudinaryConfig(env) {
	return {
		cloudName: String(
			env?.CLOUDINARY_CLOUD_NAME ||
				env?.PUBLIC_CLOUDINARY_CLOUD_NAME ||
				env?.VITE_CLOUDINARY_CLOUD_NAME ||
				'qhdvucyw'
		).trim(),
		apiKey: env?.CLOUDINARY_API_KEY ? String(env.CLOUDINARY_API_KEY).trim() : '',
		apiSecret: env?.CLOUDINARY_API_SECRET ? String(env.CLOUDINARY_API_SECRET).trim() : ''
	};
}

export function normalizeFrameName(name) {
	return String(name || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

function sanitizeOptionalString(val) {
	if (typeof val !== 'string') return null;
	const trimmed = val.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function mapRowToSession(row) {
	if (!row) return null;
	return {
		sessionId: row.session_id,
		guestName: row.guest_name || '',
		mode: row.mode || 'default',
		layoutId: row.layout_id || 'default-4-classic',
		photoUrl: row.photo_url || undefined,
		videoUrl: row.video_url || undefined,
		shareUrl: row.share_url || undefined,
		manifestUrl: row.manifest_url || undefined,
		photosCount: Number.isFinite(Number(row.photos_count)) ? Number(row.photos_count) : 4,
		printCount: Number.isFinite(Number(row.print_count)) ? Number(row.print_count) : 0,
		createdAt: Number.isFinite(Number(row.created_at)) ? Number(row.created_at) : Date.now()
	};
}

/**
 * Fetches legacy JSON manifest ('sessions' or 'frames') from Cloudinary (Admin API first, CDN fallback).
 */
export async function fetchLegacyCloudinaryManifest(env, type = 'sessions') {
	const { cloudName, apiKey, apiSecret } = getCloudinaryConfig(env);
	if (!cloudName) return null;

	const filename = type === 'sessions' ? 'sessions_manifest.json' : 'frames_manifest.json';
	const publicId = `chekiyuume/${filename}`;

	// 1. Try authenticated Admin API if credentials exist
	if (apiKey && apiSecret) {
		try {
			const authHeader = 'Basic ' + btoa(`${apiKey}:${apiSecret}`);
			const adminApiUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/raw/upload/${encodeURIComponent(publicId)}`;
			const adminRes = await fetch(adminApiUrl, {
				headers: { Authorization: authHeader },
				cache: 'no-store'
			});
			if (adminRes.ok) {
				const resourceData = await adminRes.json();
				if (resourceData?.secure_url) {
					const contentRes = await fetch(`${resourceData.secure_url}?_t=${Date.now()}`, {
						cache: 'no-store'
					});
					if (contentRes.ok) {
						return await contentRes.json();
					}
				}
			}
		} catch (err) {
			console.warn(`[LegacyManifest] Admin API lookup warning for ${filename}:`, err);
		}
	}

	// 2. Fallback to public CDN URL variants
	const cdnUrls = [
		`https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}?_t=${Date.now()}`,
		`https://res.cloudinary.com/${cloudName}/raw/upload/v1/${publicId}?_t=${Date.now()}`
	];

	for (const url of cdnUrls) {
		try {
			const res = await fetch(url, { cache: 'no-store' });
			if (res.ok) {
				return await res.json();
			}
		} catch (_) {}
	}

	return null;
}

/**
 * Looks up a single session from Cloudinary by tag (used as legacy fallback for old QR codes).
 */
export async function findLegacySessionByTag(env, sessionId, requestHost = '') {
	const { cloudName, apiKey, apiSecret } = getCloudinaryConfig(env);
	if (!cloudName || !apiKey || !apiSecret || !sessionId) return null;

	try {
		const authHeader = 'Basic ' + btoa(`${apiKey}:${apiSecret}`);
		const tagUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/by_tag/${encodeURIComponent(sessionId)}`;
		const tagRes = await fetch(tagUrl, {
			headers: { Authorization: authHeader },
			cache: 'no-store'
		});
		if (!tagRes.ok) return null;

		const tagData = await tagRes.json();
		if (!Array.isArray(tagData?.resources) || tagData.resources.length === 0) {
			return null;
		}

		let photoUrl = null;
		let videoUrl = null;
		for (const r of tagData.resources) {
			if (r.resource_type === 'image' || r.format === 'png' || r.format === 'jpg') {
				photoUrl = r.secure_url;
			} else if (r.resource_type === 'video' || r.format === 'mp4') {
				videoUrl = r.secure_url;
			}
		}

		if (!photoUrl && !videoUrl) return null;

		return {
			sessionId,
			guestName: 'Tamu',
			mode: 'default',
			layoutId: 'default-4-classic',
			photoUrl: photoUrl || undefined,
			videoUrl: videoUrl || undefined,
			shareUrl: requestHost ? `https://${requestHost}/share/${sessionId}` : undefined,
			photosCount: 4,
			printCount: 0,
			createdAt: Date.now()
		};
	} catch (err) {
		console.warn('[LegacyTag] Lookup warning:', err);
		return null;
	}
}

/**
 * Batch upsert (or insert-ignore) sessions into Cloudflare D1.
 */
export async function saveSessionsToD1(db, sessionsList, { ignoreConflicts = false } = {}) {
	if (!db || !Array.isArray(sessionsList) || sessionsList.length === 0) {
		return 0;
	}

	const valid = sessionsList.filter(
		(s) => s && typeof s.sessionId === 'string' && s.sessionId.trim().length > 0
	);
	if (valid.length === 0) return 0;

	const sql = ignoreConflicts
		? `INSERT OR IGNORE INTO sessions (
				session_id, guest_name, mode, layout_id, photo_url, video_url, share_url, manifest_url, photos_count, print_count, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		: `INSERT INTO sessions (
				session_id, guest_name, mode, layout_id, photo_url, video_url, share_url, manifest_url, photos_count, print_count, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(session_id) DO UPDATE SET
				guest_name = CASE WHEN excluded.guest_name != '' THEN excluded.guest_name ELSE sessions.guest_name END,
				mode = COALESCE(excluded.mode, sessions.mode),
				layout_id = COALESCE(excluded.layout_id, sessions.layout_id),
				photo_url = COALESCE(excluded.photo_url, sessions.photo_url),
				video_url = COALESCE(excluded.video_url, sessions.video_url),
				share_url = COALESCE(excluded.share_url, sessions.share_url),
				manifest_url = COALESCE(excluded.manifest_url, sessions.manifest_url),
				photos_count = COALESCE(excluded.photos_count, sessions.photos_count),
				print_count = MAX(sessions.print_count, excluded.print_count),
				updated_at = excluded.updated_at`;

	const now = Date.now();
	const stmt = db.prepare(sql);
	const boundStmts = valid.map((s) =>
		stmt.bind(
			s.sessionId.trim(),
			typeof s.guestName === 'string' ? s.guestName.trim() : '',
			typeof s.mode === 'string' && s.mode.trim() ? s.mode.trim() : 'default',
			typeof s.layoutId === 'string' && s.layoutId.trim() ? s.layoutId.trim() : 'default-4-classic',
			sanitizeOptionalString(s.photoUrl),
			sanitizeOptionalString(s.videoUrl),
			sanitizeOptionalString(s.shareUrl),
			sanitizeOptionalString(s.manifestUrl),
			Number.isFinite(Number(s.photosCount)) ? Number(s.photosCount) : 4,
			Number.isFinite(Number(s.printCount)) ? Number(s.printCount) : 0,
			Number.isFinite(Number(s.createdAt)) ? Number(s.createdAt) : now,
			now
		)
	);

	// D1 supports up to ~100 statements per batch reliably; chunk by 50
	for (let i = 0; i < boundStmts.length; i += 50) {
		await db.batch(boundStmts.slice(i, i + 50));
	}

	return valid.length;
}

/**
 * Deduplicates and saves custom frames into Cloudflare D1.
 */
export async function saveFramesToD1(
	db,
	framesList,
	{ ignoreConflicts = false, replaceAll = false } = {}
) {
	if (!db || !Array.isArray(framesList)) return [];

	const customOnly = framesList.filter(
		(f) => f && typeof f.id === 'string' && f.id.startsWith('custom-') && typeof f.name === 'string'
	);

	const seen = new Set();
	const deduped = [];
	for (const f of customOnly) {
		const norm = normalizeFrameName(f.name);
		if (!norm || seen.has(norm)) continue;
		seen.add(norm);
		deduped.push(f);
	}

	if (replaceAll) {
		if (deduped.length === 0) {
			await db.prepare('DELETE FROM custom_frames').run();
			return [];
		}
		const existingRows = await db.prepare('SELECT normalized_name FROM custom_frames').all();
		const toDelete = (existingRows?.results || [])
			.map((r) => r.normalized_name)
			.filter((n) => !seen.has(n));
		if (toDelete.length > 0) {
			const delStmt = db.prepare('DELETE FROM custom_frames WHERE normalized_name = ?');
			for (let i = 0; i < toDelete.length; i += 50) {
				await db.batch(toDelete.slice(i, i + 50).map((n) => delStmt.bind(n)));
			}
		}
	}

	if (deduped.length === 0) return [];

	const sql = ignoreConflicts
		? `INSERT OR IGNORE INTO custom_frames (
				id, name, normalized_name, description, mode, total_slots, background_color, overlay_url, background_url, layout_json, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		: `INSERT INTO custom_frames (
				id, name, normalized_name, description, mode, total_slots, background_color, overlay_url, background_url, layout_json, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(normalized_name) DO UPDATE SET
				name = excluded.name,
				description = excluded.description,
				mode = excluded.mode,
				total_slots = excluded.total_slots,
				background_color = excluded.background_color,
				overlay_url = excluded.overlay_url,
				background_url = excluded.background_url,
				layout_json = excluded.layout_json,
				updated_at = excluded.updated_at`;

	const now = Date.now();
	const stmt = db.prepare(sql);
	const boundStmts = deduped.map((f) =>
		stmt.bind(
			f.id.trim(),
			f.name.trim(),
			normalizeFrameName(f.name),
			typeof f.description === 'string' ? f.description : '',
			typeof f.mode === 'string' && f.mode ? f.mode : 'default',
			Number.isFinite(Number(f.totalSlots)) ? Number(f.totalSlots) : 4,
			typeof f.backgroundColor === 'string' && f.backgroundColor ? f.backgroundColor : '#FFFFFF',
			sanitizeOptionalString(f.overlayUrl),
			sanitizeOptionalString(f.backgroundUrl),
			JSON.stringify(f),
			now,
			now
		)
	);

	for (let i = 0; i < boundStmts.length; i += 50) {
		await db.batch(boundStmts.slice(i, i + 50));
	}

	return deduped;
}
