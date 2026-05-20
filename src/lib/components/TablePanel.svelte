<script lang="ts">
import { cardLabel, suitMarks } from '$lib/game/engine';
import type { PublicRoomState } from '$lib/game/types';

export let state: PublicRoomState;
export let selectedCount: number;
export let isMyTurn: boolean;
export let isHost: boolean;
export let onStart: () => void;
export let onPlay: () => void;
export let onPass: () => void;
export let onReset: () => void;

const currentPlayer = () => state.players.find((player) => player.id === state.turnPlayerId);
const lockLabel = () => state.pile?.lockSuits.map((suit) => suitMarks[suit]).join('') ?? '';
</script>

<div class="panel table">
	<div class="statusbar">
		<div>
			<p class="muted">Room</p>
			<h2>{state.id}</h2>
		</div>
		<div class="badges">
			<span>{state.phase}</span>
			<span>{state.players.length}人</span>
			<span>{state.decks} deck</span>
			<span>{state.turnDirection === 1 ? '時計回り' : '反時計回り'}</span>
			{#if state.revolution}<span class="danger">革命中</span>{/if}
			{#if state.jackBack}<span class="danger">11バック</span>{/if}
			{#if state.pile?.lockSuits.length}<span class="danger">縛り {lockLabel()}</span>{/if}
		</div>
	</div>

	<div class="pile">
		<p class="muted">場</p>
		{#if state.pile}
			<div class="cards center">
				{#each state.pile.cards as card (card.id)}
					<div class="card table-card">{cardLabel(card)}</div>
				{/each}
			</div>
		{:else}
			<div class="empty">場は空です。自由に出せます。</div>
		{/if}
	</div>

	<div class="controls">
		{#if state.phase === 'lobby'}
			<button class="primary" on:click={onStart} disabled={state.players.length < 2 || !isHost}>開始</button>
		{:else if state.phase === 'playing'}
			<strong>{currentPlayer()?.name ?? '誰か'} の番</strong>
			<button class="primary" on:click={onPlay} disabled={!isMyTurn || selectedCount === 0}>出す</button>
			<button on:click={onPass} disabled={!isMyTurn || !state.pile}>パス</button>
		{:else}
			<button class="primary" on:click={onReset} disabled={!isHost}>次のラウンドへ</button>
		{/if}
	</div>
</div>
