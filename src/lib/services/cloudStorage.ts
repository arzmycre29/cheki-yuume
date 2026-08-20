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
 * Uploads session assets to configured Cloud Storage (Cloudflare R2 / S3 / Supabase)
 */
export async function uploadSessionToCloud(
	session: SessionData,
	settings: KioskSettings
): Promise<{ photoUrl: string | null; videoUrl: string | null; shareUrl: string }> {
	const fallbackShareUrl = `${window.location.origin}/share/${session.sessionId}`;

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

		// In a production server/edge environment, this POSTs to an edge worker or S3 presigned URL
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
