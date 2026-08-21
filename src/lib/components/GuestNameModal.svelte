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
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 lg:p-6 overflow-y-auto">
		<div class="w-full max-w-md rounded-2xl sm:rounded-3xl bg-zinc-900 border border-zinc-800 p-3.5 sm:p-6 lg:p-8 shadow-2xl text-center transform animate-in fade-in zoom-in duration-200 my-auto max-h-[94vh] overflow-y-auto scrollbar-none">
			<div class="mx-auto flex h-8 w-8 sm:h-12 sm:w-12 lg:h-14 lg:w-14 items-center justify-center rounded-xl sm:rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-1.5 sm:mb-3">
				<Sparkles class="h-4 w-4 sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
			</div>

			<h2 class="text-base sm:text-xl lg:text-2xl font-black tracking-tight text-white font-display">
				Beri Nama Sesimu
			</h2>
			<p class="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-zinc-400 max-w-xs mx-auto line-clamp-1 sm:line-clamp-2">
				Nama sesi memudahkan pencarian & pengiriman file foto/video kamu.
			</p>

			<div class="mt-2.5 sm:mt-4 text-left">
				<label for="guest-name-input" class="block text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
					Nama Tamu / Pasangan / No. WA
				</label>
				<div class="relative">
					<User class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
					<input
						id="guest-name-input"
						type="text"
						bind:value={guestInput}
						placeholder="Contoh: Rian & Sarah / 08123456789"
						class="w-full rounded-xl sm:rounded-2xl bg-zinc-800/80 border border-zinc-700 py-2 sm:py-3 pl-10 pr-3 text-xs sm:text-sm lg:text-base text-white placeholder-zinc-500 focus:border-rose-500 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20"
						onkeydown={(e) => e.key === 'Enter' && handleSubmit()}
					/>
				</div>
			</div>

			<!-- Quick Tag Suggestions -->
			<div class="mt-2 sm:mt-3 flex flex-wrap justify-center gap-1 sm:gap-1.5">
				{#each quickTags as tag}
					<button
						type="button"
						onclick={() => selectTag(tag)}
						class="rounded-full border border-zinc-800 bg-zinc-800/60 px-2.5 py-0.5 text-[9px] sm:text-[11px] font-medium text-zinc-300 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 active:scale-95 transition-all cursor-pointer"
					>
						+{tag}
					</button>
				{/each}
			</div>

			<div class="mt-3 sm:mt-5">
				<button
					type="button"
					onclick={handleSubmit}
					class="w-full flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-gradient-to-r from-rose-500 to-indigo-600 py-2.5 sm:py-3.5 text-xs sm:text-sm lg:text-base font-bold text-white shadow-lg shadow-rose-500/20 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer min-h-[38px] sm:min-h-[44px]"
				>
					<span>Mulai Sesi Foto</span>
					<ArrowRight class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
				</button>
			</div>
		</div>
	</div>
{/if}
