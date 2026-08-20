import QRCode from 'qrcode';
import type { SessionData, KioskSettings } from '$lib/types';

export async function generateQrCodeDataUrl(text: string): Promise<string> {
	try {
		return await QRCode.toDataURL(text, {
			width: 320,
			margin: 1,
			color: {
				dark: '#000000',
				light: '#ffffff'
			},
			errorCorrectionLevel: 'M'
		});
	} catch (err) {
		console.error('[QR] Failed to generate QR code:', err);
		return '';
	}
}

/**
 * Uploads a single file to Cloudinary via Unsigned Upload Preset
 */
export async function uploadToCloudinary(
	file: Blob | File,
	resourceType: 'image' | 'video',
	cloudName: string,
	uploadPreset: string,
	publicId?: string
): Promise<string> {
	const formData = new FormData();
	formData.append('file', file);
	formData.append('upload_preset', uploadPreset);
	if (publicId) {
		formData.append('public_id', publicId);
	}

	const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
	const res = await fetch(endpoint, {
		method: 'POST',
		body: formData
	});

	if (!res.ok) {
		const errJson = await res.json().catch(() => ({}));
		throw new Error(`Cloudinary upload failed: ${errJson.error?.message || res.statusText}`);
	}

	const data = await res.json();
	return data.secure_url;
}

/**
 * Uploads session assets to configured Cloud Storage (Cloudflare R2 / S3 / Supabase / Cloudinary)
 */
export async function uploadSessionToCloud(
	session: SessionData,
	settings: KioskSettings
): Promise<{ photoUrl: string | null; videoUrl: string | null; shareUrl: string }> {
	const fallbackShareUrl = `${window.location.origin}/share/${session.sessionId}`;

	// Handle Cloudinary Provider
	if (settings.cloudProvider === 'cloudinary') {
		const cloudName = settings.cloudinaryCloudName?.trim();
		const uploadPreset = settings.cloudinaryUploadPreset?.trim();

		if (!cloudName || !uploadPreset) {
			console.warn('[Cloudinary] Cloud Name or Upload Preset is not configured.');
			return {
				photoUrl: null,
				videoUrl: null,
				shareUrl: fallbackShareUrl
			};
		}

		let photoUrl: string | null = null;
		let videoUrl: string | null = null;

		try {
			// 1. Upload Photostrip
			if (session.photostripBlob) {
				photoUrl = await uploadToCloudinary(
					session.photostripBlob,
					'image',
					cloudName,
					uploadPreset,
					`chekiyuume_${session.sessionId}_photo`
				);
			} else if (session.photostripDataUrl) {
				const res = await fetch(session.photostripDataUrl);
				const blob = await res.blob();
				photoUrl = await uploadToCloudinary(
					blob,
					'image',
					cloudName,
					uploadPreset,
					`chekiyuume_${session.sessionId}_photo`
				);
			}

			// 2. Upload Videostrip (if available)
			if (session.videostripBlob) {
				videoUrl = await uploadToCloudinary(
					session.videostripBlob,
					'video',
					cloudName,
					uploadPreset,
					`chekiyuume_${session.sessionId}_video`
				);
			}

			// Construct Share Page URL with query params
			const basePublicUrl = settings.cloudPublicBaseUrl?.trim() || window.location.origin;
			const shareParams = new URLSearchParams();
			if (photoUrl) shareParams.set('p', photoUrl);
			if (videoUrl) shareParams.set('v', videoUrl);
			if (session.guestName) shareParams.set('n', session.guestName);

			const queryString = shareParams.toString();
			const shareUrl = `${basePublicUrl}/share/${session.sessionId}${queryString ? `?${queryString}` : ''}`;

			return {
				photoUrl,
				videoUrl,
				shareUrl
			};
		} catch (err) {
			console.error('[Cloudinary] Upload failed, using fallback:', err);
			return {
				photoUrl,
				videoUrl,
				shareUrl: fallbackShareUrl
			};
		}
	}

	if (settings.cloudProvider === 'none' || !settings.cloudEndpoint) {
		// Offline / Local-only mode
		return {
			photoUrl: null,
			videoUrl: null,
			shareUrl: fallbackShareUrl
		};
	}

	try {
		// If cloud public base URL is set, construct the direct public share URL
		const basePublicUrl = settings.cloudPublicBaseUrl || window.location.origin;
		const shareUrl = `${basePublicUrl}/share/${session.sessionId}`;

		// S3 / R2 Bucket structure
		return {
			photoUrl: `${settings.cloudEndpoint}/${settings.cloudBucket}/${session.sessionId}/photostrip.png`,
			videoUrl: `${settings.cloudEndpoint}/${settings.cloudBucket}/${session.sessionId}/videostrip.mp4`,
			shareUrl
		};
	} catch (err) {
		console.error('[Cloud] Upload failed, falling back to local share URL:', err);
		return {
			photoUrl: null,
			videoUrl: null,
			shareUrl: fallbackShareUrl
		};
	}
}
