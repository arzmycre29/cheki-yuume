CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    guest_name TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'default',
    layout_id TEXT NOT NULL DEFAULT 'default-4-classic',
    photo_url TEXT,
    video_url TEXT,
    share_url TEXT,
    manifest_url TEXT,
    photos_count INTEGER NOT NULL DEFAULT 4,
    print_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_guest_name ON sessions (guest_name);

CREATE TABLE IF NOT EXISTS custom_frames (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'default',
    total_slots INTEGER NOT NULL DEFAULT 4,
    background_color TEXT NOT NULL DEFAULT '#FFFFFF',
    overlay_url TEXT,
    background_url TEXT,
    layout_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_frames_updated_at ON custom_frames (updated_at DESC);
