/**
 * Web Audio API synthesizer for instant zero-latency photobooth sound effects
 */
class SoundEngine {
	private ctx: AudioContext | null = null;

	private getContext(): AudioContext | null {
		if (typeof window === 'undefined') return null;
		if (!this.ctx) {
			const AudioCtx =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			if (AudioCtx) {
				this.ctx = new AudioCtx();
			}
		}
		if (this.ctx && this.ctx.state === 'suspended') {
			this.ctx.resume();
		}
		return this.ctx;
	}

	playBeep(frequency = 880, duration = 0.12, type: OscillatorType = 'sine', volume = 0.5) {
		const ctx = this.getContext();
		if (!ctx) return;

		try {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();

			osc.type = type;
			osc.frequency.setValueAtTime(frequency, ctx.currentTime);

			gain.gain.setValueAtTime(volume, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

			osc.connect(gain);
			gain.connect(ctx.destination);

			osc.start();
			osc.stop(ctx.currentTime + duration);
		} catch (e) {
			console.warn('Audio play failed', e);
		}
	}

	playCountdownTick() {
		// Punchy woodblock tick
		this.playBeep(880, 0.1, 'sine', 0.6);
		setTimeout(() => {
			this.playBeep(440, 0.08, 'triangle', 0.3);
		}, 20);
	}

	playFinalCountdownTick() {
		// High alert double-ping
		this.playBeep(1320, 0.18, 'sine', 0.7);
		setTimeout(() => {
			this.playBeep(1760, 0.15, 'sine', 0.8);
		}, 50);
	}

	playShutter() {
		const ctx = this.getContext();
		if (!ctx) return;

		try {
			// Shutter click 1 (Mirror up)
			this.playBeep(1600, 0.04, 'square', 0.5);
			setTimeout(() => {
				// Shutter click 2 (Curtain close)
				this.playBeep(600, 0.08, 'triangle', 0.6);
				// Mechanical wind down
				this.playBeep(300, 0.12, 'sine', 0.4);
			}, 45);
		} catch (e) {
			console.warn('Audio shutter failed', e);
		}
	}

	playCelebration() {
		const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
		notes.forEach((freq, idx) => {
			setTimeout(() => {
				this.playBeep(freq, 0.28, 'sine', 0.5);
			}, idx * 120);
		});
	}
}

export const soundEngine = new SoundEngine();
