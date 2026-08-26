#!/usr/bin/env node

/**
 * sync-android.js
 * 
 * Tool to easily synchronize the latest web build output from ChekiYuume
 * to an external Android project (Capacitor or custom WebView assets).
 * 
 * Usage:
 *   node scripts/sync-android.js "D:\Path\To\Android\Project"
 *   node scripts/sync-android.js "D:\Path\To\Android\Project\app\src\main\assets\public"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceBuildDir = path.resolve(projectRoot, 'build');

function copyDirRecursive(src, dest) {
	if (!fs.existsSync(dest)) {
		fs.mkdirSync(dest, { recursive: true });
	}

	const entries = fs.readdirSync(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);

		if (entry.isDirectory()) {
			copyDirRecursive(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

function main() {
	const targetArg = process.argv[2];

	if (!targetArg) {
		console.log(`\x1b[33m[!] Silakan tentukan direktori proyek Android tujuan.\x1b[0m`);
		console.log(`Contoh penggunaan:`);
		console.log(`  node scripts/sync-android.js "D:\\Project App\\ChekiYuume-Android"`);
		console.log(`  node scripts/sync-android.js "D:\\Project App\\ChekiYuume-Android\\app\\src\\main\\assets\\public"`);
		process.exit(1);
	}

	if (!fs.existsSync(sourceBuildDir)) {
		console.error(`\x1b[31m[x] Folder 'build/' belum tersedia. Jalankan 'npm run build' terlebih dahulu.\x1b[0m`);
		process.exit(1);
	}

	let targetAssetsDir = path.resolve(targetArg);

	// If user pointed to the root of an Android project (or Capacitor android root)
	if (fs.existsSync(path.join(targetAssetsDir, 'app', 'src', 'main', 'assets'))) {
		targetAssetsDir = path.join(targetAssetsDir, 'app', 'src', 'main', 'assets', 'public');
	} else if (fs.existsSync(path.join(targetAssetsDir, 'src', 'main', 'assets'))) {
		targetAssetsDir = path.join(targetAssetsDir, 'src', 'main', 'assets', 'public');
	}

	console.log(`\x1b[36m[*] Menyinkronkan build ke Android...\x1b[0m`);
	console.log(`    Sumber: ${sourceBuildDir}`);
	console.log(`    Tujuan: ${targetAssetsDir}`);

	try {
		// Clean existing destination folder
		if (fs.existsSync(targetAssetsDir)) {
			fs.rmSync(targetAssetsDir, { recursive: true, force: true });
		}
		fs.mkdirSync(targetAssetsDir, { recursive: true });

		copyDirRecursive(sourceBuildDir, targetAssetsDir);

		console.log(`\x1b[32m[✓] Sinkronisasi berhasil! Seluruh web assets terbaru telah disalin ke:\x1b[0m`);
		console.log(`    ${targetAssetsDir}`);
	} catch (err) {
		console.error(`\x1b[31m[x] Gagal menyinkronkan berkas:\x1b[0m`, err);
		process.exit(1);
	}
}

main();
