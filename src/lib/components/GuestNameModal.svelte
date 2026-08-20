<script lang="ts">
	import { sessionStore } from '$lib/stores/session';
	import { User, Sparkles, ArrowRight } from '@lucide/svelte';

	interface Props {
		isOpen: boolean;
		onConfirm: (name: string) => void;
	}

	let { isOpen, onConfirm }: Props = $props();

	let guestInput = $state('');
	const quickTags = ['Couple Session', 'Besties', 'Solo Aesthetic', 'Family Fun', 'Birthday Bash'];

	function handleSubmit() {
		const finalName = guestInput.trim() || 'Tamu Istimewa';
		sessionStore.setGuestName(finalName);
		onConfirm(finalName);
	}

	function selectTag(tag: string) {
		guestInput = tag;
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
		<div class="w-full max-w-lg rounded-3xl bg-zinc-900 border border-zinc-800 p-8 shadow-2xl text-center transform animate-in fade-in zoom-in duration-300">
			<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-6">
				<Sparkles class="h-8 w-8" />
			</div>

			<h2 class="text-3xl font-black tracking-tight text-white font-display">
				Beri Nama Sesimu
			</h2>
			<p class="mt-2 text-sm text-zinc-400">
				Nama sesi memudahkan kamu mencari atau menerima file foto & video jika ada kendala di mesin booth.
			</p>

			<div class="mt-6 text-left">
				<label for="guest-name-input" class="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
					Nama Tamu / Pasangan / WhatsApp
				</label>
				<div class="relative">
					<User class="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
					<input
						id="guest-name-input"
						type="text"
						bind:value={guestInput}
						placeholder="Contoh: Rian & Sarah / 08123456789"
						class="w-full rounded-2xl bg-zinc-800/80 border border-zinc-700 py-4 pl-12 pr-4 text-lg text-white placeholder-zinc-500 focus:border-rose-500 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20"
						onkeydown={(e) => e.key === 'Enter' && handleSubmit()}
						autofocus
					/>
				</div>
			</div>

			<!-- Quick Tag Suggestions -->
			<div class="mt-4 flex flex-wrap justify-center gap-2">
				{#each quickTags as tag}
					<button
						type="button"
						onclick={() => selectTag(tag)}
						class="rounded-full border border-zinc-800 bg-zinc-800/50 px-3 py-1 text-xs font-medium text-zinc-300 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 transition-all cursor-pointer"
					>
						+{tag}
					</button>
				{/each}
			</div>

			<div class="mt-8 flex gap-3">
				<button
					type="button"
					onclick={handleSubmit}
					class="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-indigo-600 py-4 text-base font-bold text-white shadow-lg shadow-rose-500/20 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
				>
					<span>Mulai Sesi Foto</span>
					<ArrowRight class="h-5 w-5" />
				</button>
			</div>
		</div>
	</div>
{/if}
