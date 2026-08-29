export type CaptureMode = 'default' | 'creative';

export interface PhotoItem {
	id: string;
	index: number;
	dataUrl: string;
	blob?: Blob;
	timestamp: number;
	btsVideoBlob?: Blob;
	btsVideoUrl?: string;
	btsFrames?: (ImageBitmap | string)[];
}

export interface FrameSlot {
	index: number;
	x: number;
	y: number;
	width: number;
	height: number;
	borderRadius?: number;
}

export interface FrameLayout {
	id: string;
	name: string;
	description: string;
	mode: CaptureMode;
	totalSlots: number;
	canvasWidth: number;
	canvasHeight: number;
	slotWidth: number;
	slotHeight: number;
	margin: number;
	slots: FrameSlot[];
	overlayUrl?: string;
	backgroundUrl?: string;
	backgroundColor: string;
	footerHeight: number;
	aspectRatioLabel: string;
	recommendedPaper: '4R' | 'A4';
}

export interface StickerItem {
	id: string;
	emoji: string;
	x: number; // percentage of canvas (0-100)
	y: number; // percentage of canvas (0-100)
	size: number; // in pixels or percentage
	rotation?: number; // degrees
}

export interface SessionData {
	sessionId: string;
	guestName: string;
	createdAt: number;
	mode: CaptureMode;
	layoutId: string;
	photos: PhotoItem[];
	photosCount?: number;
	assignedSlotPhotoIds: (string | null)[];
	stickers?: StickerItem[];
	photostripDataUrl: string | null;
	photostripBlob: Blob | null;
	videostripBlob: Blob | null;
	videostripUrl: string | null;
	printCount: number;
	cloudUploadStatus: 'idle' | 'uploading' | 'success' | 'failed';
	cloudPhotoUrl: string | null;
	cloudVideoUrl: string | null;
	cloudShareUrl: string | null;
	isOfflineSaved: boolean;
}

export type CloudProvider = 'cloudinary' | 'r2' | 's3' | 'supabase' | 'none';

export interface KioskSettings {
	cameraSource?: 'internal' | 'uvc';
	cameraDeviceId: string;
	cameraResolution: '1080p' | '4k' | '720p';
	isMirrored: boolean;
	countdownSeconds: number;
	btsDurationSeconds: number;
	autoResetSeconds: number;
	adminPin: string;
	kioskTitle: string;
	kioskSubtitle: string;
	eventLogoUrl?: string;
	cloudProvider: CloudProvider;
	cloudinaryCloudName?: string;
	cloudinaryUploadPreset?: string;
	cloudPublicBaseUrl: string;
	cloudEndpoint: string;
	cloudBucket: string;
	cloudAccessKey: string;
	cloudSecretKey: string;
	defaultPaperSize: '4R' | 'A4';
	defaultCopies: 1 | 2 | 4;
	enableSound: boolean;
}

export type LayoutCategory = 'strip' | 'duo' | 'card';

export interface PrintOptions {
	paperSize: '4R' | 'A4';
	orientation: 'portrait' | 'landscape';
	copies: 1 | 2 | 4;
	sizeMode: 'actual' | 'fit';
	alignment: 'top-left' | 'center';
	layoutCategory?: LayoutCategory;
	selectedSlot?: number; // 0, 1, 2, 3 (index of slot / quadrant)
	a4SlotLane?: 1 | 2 | 3 | 4;
}
