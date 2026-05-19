<script lang="ts">
import { cardLabel } from '$lib/game/engine';
import type { Card } from '$lib/game/types';

export let hand: Card[];
export let playerName: string;
export let selected: Set<string>;
export let onToggle: (card: Card) => void;
</script>

<section class="panel hand-panel">
	<div class="statusbar">
		<div>
			<p class="muted">Your hand</p>
			<h2>{playerName}</h2>
		</div>
		<p>{selected.size}枚選択中</p>
	</div>
	<div class="cards hand">
		{#each hand as card (card.id)}
			<button class:selected={selected.has(card.id)} class="card" on:click={() => onToggle(card)}>{cardLabel(card)}</button>
		{/each}
	</div>
</section>
