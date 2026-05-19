<script lang="ts">
import { apiBase, connectRoom, createRoom, setApiBase } from '$lib/game/client';
import { cardLabel, ruleDescriptions } from '$lib/game/engine';
import type { Card, PublicRoomState, RuleSettings, Suit } from '$lib/game/types';

let name = 'Player';
let roomId = '';
let apiBaseInput = '';
let playerId = '';
let state: PublicRoomState | undefined;
let selected = new Set<string>();
let error = '';
let client: ReturnType<typeof connectRoom> | undefined;

const ruleEntries = Object.entries(ruleDescriptions) as [keyof RuleSettings, string][];
const suitMarks: Record<Suit, string> = {
	spades: '♠',
	hearts: '♥',
	diamonds: '♦',
	clubs: '♣',
	joker: 'J',
};

const isMyTurn = () => state?.turnPlayerId === playerId;
const me = () => state?.players.find((player) => player.id === playerId);
const currentPlayer = () => state?.players.find((player) => player.id === state?.turnPlayerId);
const selectedCards = () =>
	state?.me?.hand.filter((card) => selected.has(card.id)).map((card) => cardLabel(card)) ?? [];

function setRule(key: keyof RuleSettings, checked: boolean) {
	client?.send({ type: 'updateRules', rules: { [key]: checked } });
}

async function handleCreateRoom() {
	error = '';
	try {
		if (apiBaseInput.trim()) setApiBase(apiBaseInput);
		const created = await createRoom();
		roomId = created.roomId;
		connect();
	} catch (reason) {
		error = reason instanceof Error ? reason.message : '部屋を作成できませんでした';
	}
}

function connect() {
	error = '';
	if (apiBaseInput.trim()) setApiBase(apiBaseInput);
	client?.close();
	client = connectRoom({
		roomId: roomId.trim().toLowerCase(),
		name,
		playerId: localStorage.getItem(`daihugou:${roomId}:playerId`) ?? undefined,
		onState(next) {
			state = next;
			selected = new Set(
				[...selected].filter((id) => next.me?.hand.some((card) => card.id === id)),
			);
		},
		onJoined(nextPlayerId) {
			playerId = nextPlayerId;
			localStorage.setItem(`daihugou:${roomId}:playerId`, nextPlayerId);
		},
		onError(message) {
			error = message;
		},
	});
}

function toggle(card: Card) {
	const next = new Set(selected);
	if (next.has(card.id)) next.delete(card.id);
	else next.add(card.id);
	selected = next;
}

function play() {
	client?.send({ type: 'play', cardIds: [...selected] });
	selected = new Set();
}

function pass() {
	client?.send({ type: 'pass' });
}

function cardTone(card: Card) {
	if (card.suit === 'hearts' || card.suit === 'diamonds') return 'red';
	if (card.suit === 'joker') return 'joker';
	return 'black';
}

function rankText(playerIdToFind: string, fallback: number) {
	const winnerIndex = state?.winners.indexOf(playerIdToFind) ?? -1;
	return winnerIndex >= 0 ? `#${winnerIndex + 1}` : String(fallback + 1);
}

function phaseLabel(phase: PublicRoomState['phase']) {
	if (phase === 'lobby') return 'ロビー';
	if (phase === 'playing') return '対局中';
	return '終了';
}

function activeApiBase() {
	return apiBaseInput.trim() || apiBase() || '同一オリジン';
}
</script>

<svelte:head>
	<title>大富豪 Online</title>
	<meta name="description" content="Cloudflare Workersで動く多人数対応の大富豪Webアプリ" />
</svelte:head>

<main class="app-shell">
	<section class="entry-band">
		<div class="brand-block">
			<p class="eyebrow">Daifugō table</p>
			<h1>大富豪</h1>
			<div class="table-meter">
				<span>Workers</span>
				<span>Durable Objects</span>
				<span>WebSocket</span>
			</div>
		</div>

		<div class="join-board">
			<div class="join-title">
				<p>Room</p>
				<strong>{state ? state.id : 'New table'}</strong>
			</div>
			<label>
				<span>名前</span>
				<input bind:value={name} placeholder="Kan" />
			</label>
			<div class="join-actions">
				<button class="button primary" on:click={handleCreateRoom}>新しい卓</button>
				<label class="room-field">
					<span>部屋コード</span>
					<input bind:value={roomId} placeholder="例: a1b2c3d4" />
				</label>
				<button class="button secondary" on:click={connect} disabled={!roomId}>入る</button>
			</div>
			<details class="endpoint">
				<summary>接続先</summary>
				<input bind:value={apiBaseInput} placeholder={activeApiBase()} />
			</details>
			{#if error}<p class="error">{error}</p>{/if}
		</div>
	</section>

	{#if state}
		<section class="room-strip">
			<div>
				<p>Room code</p>
				<strong>{state.id}</strong>
			</div>
			<div>
				<p>Status</p>
				<strong>{phaseLabel(state.phase)}</strong>
			</div>
			<div>
				<p>Players</p>
				<strong>{state.players.length}</strong>
			</div>
			<div>
				<p>Deck</p>
				<strong>{state.decks}</strong>
			</div>
			<div>
				<p>Direction</p>
				<strong>{state.turnDirection === 1 ? '時計回り' : '反時計回り'}</strong>
			</div>
		</section>

		<section class="table-layout">
			<aside class="seat-rail">
				<div class="section-heading">
					<p>Seats</p>
					<h2>席順</h2>
				</div>
				<div class="seat-list">
					{#each state.players as player, index (player.id)}
						<div
							class:active={player.id === state.turnPlayerId}
							class:me={player.id === playerId}
							class="seat-row"
						>
							<span>{rankText(player.id, index)}</span>
							<div>
								<strong>{player.name}{player.id === playerId ? ' / you' : ''}</strong>
								<p>{state.handCounts[player.id] ?? 0}枚 · {player.connected ? 'online' : 'offline'}</p>
							</div>
						</div>
					{/each}
				</div>
			</aside>

			<div class="table-stage">
				<div class="table-flags">
					<span class:lit={state.revolution}>革命</span>
					<span class:lit={state.jackBack}>11バック</span>
					<span class:lit={Boolean(state.pile?.lockSuits.length)}>
						縛り
						{#if state.pile?.lockSuits.length}
							{state.pile.lockSuits.map((suit) => suitMarks[suit]).join('')}
						{/if}
					</span>
				</div>

				<div class="felt">
					<div class="felt-ring"></div>
					<div class="pile-zone">
						<p>場</p>
						{#if state.pile}
							<div class="played-cards">
								{#each state.pile.cards as card (card.id)}
									<div class={`playing-card ${cardTone(card)}`}>
										<span>{card.label}</span>
										<b>{suitMarks[card.suit]}</b>
									</div>
								{/each}
							</div>
						{:else}
							<div class="empty-pile">OPEN</div>
						{/if}
					</div>
				</div>

				<div class="action-bar">
					<div>
						<p>Turn</p>
						<strong>{state.phase === 'playing' ? (currentPlayer()?.name ?? '待機中') : phaseLabel(state.phase)}</strong>
					</div>
					<div class="action-buttons">
						{#if state.phase === 'lobby'}
							<button
								class="button primary"
								on:click={() => client?.send({ type: 'start' })}
								disabled={state.players.length < 2}
							>
								開始
							</button>
						{:else if state.phase === 'playing'}
							<button class="button primary" on:click={play} disabled={!isMyTurn() || selected.size === 0}>
								出す
							</button>
							<button class="button secondary" on:click={pass} disabled={!isMyTurn() || !state.pile}>
								パス
							</button>
						{:else}
							<button class="button primary" on:click={() => client?.send({ type: 'reset' })}>
								次へ
							</button>
						{/if}
					</div>
				</div>
			</div>
		</section>

		<section class="hand-dock">
			<div class="hand-head">
				<div>
					<p>Your hand</p>
					<h2>{me()?.name ?? name}</h2>
				</div>
				<strong>{selected.size ? selectedCards().join(' ') : `${state.me?.hand.length ?? 0}枚`}</strong>
			</div>
			<div class="hand-track">
				{#each state.me?.hand ?? [] as card (card.id)}
					<button
						class:selected={selected.has(card.id)}
						class={`playing-card hand-card ${cardTone(card)}`}
						on:click={() => toggle(card)}
					>
						<span>{card.label}</span>
						<b>{suitMarks[card.suit]}</b>
					</button>
				{/each}
			</div>
		</section>

		<section class="lower-grid">
			<div class="rules-board">
				<div class="section-heading">
					<p>Rules</p>
					<h2>ルール</h2>
				</div>
				<div class="rule-grid">
					{#each ruleEntries as [key, label]}
						<label class="rule-toggle">
							<input
								type="checkbox"
								checked={state.rules[key]}
								disabled={state.phase !== 'lobby'}
								on:change={(event) => setRule(key, event.currentTarget.checked)}
							/>
							<span>{label}</span>
						</label>
					{/each}
				</div>
			</div>

			<div class="log-board">
				<div class="section-heading">
					<p>Log</p>
					<h2>進行</h2>
				</div>
				<div class="log-list">
					{#each state.log as entry (entry.id)}
						<p><time>{new Date(entry.at).toLocaleTimeString('ja-JP')}</time>{entry.message}</p>
					{/each}
				</div>
			</div>
		</section>
	{/if}
</main>

<style>
	:global(body) {
		background:
			radial-gradient(circle at 12% 0%, rgba(202, 45, 58, 0.18), transparent 32rem),
			radial-gradient(circle at 88% 12%, rgba(216, 166, 71, 0.2), transparent 30rem),
			linear-gradient(135deg, #071f1a 0%, #17130f 48%, #070605 100%);
	}

	.app-shell {
		width: min(1240px, calc(100% - 28px));
		margin: 0 auto;
		padding: 28px 0 48px;
		color: #fbf5e9;
	}

	.entry-band {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(360px, 460px);
		gap: 24px;
		align-items: stretch;
		min-height: 360px;
	}

	.brand-block,
	.join-board,
	.seat-rail,
	.table-stage,
	.hand-dock,
	.rules-board,
	.log-board,
	.room-strip div,
	.seat-row,
	.room-field {
		min-width: 0;
	}

	.brand-block {
		position: relative;
		display: grid;
		align-content: center;
		min-height: 100%;
		padding: clamp(28px, 6vw, 64px);
		border: 1px solid rgba(251, 245, 233, 0.14);
		border-radius: 8px;
		background:
			linear-gradient(90deg, rgba(251, 245, 233, 0.08) 1px, transparent 1px),
			linear-gradient(0deg, rgba(251, 245, 233, 0.06) 1px, transparent 1px),
			linear-gradient(145deg, rgba(12, 69, 54, 0.9), rgba(16, 19, 15, 0.86));
		background-size: 42px 42px, 42px 42px, auto;
		box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
		overflow: hidden;
	}

	.brand-block::after {
		content: '♠ ♥ ♦ ♣';
		position: absolute;
		right: clamp(18px, 5vw, 56px);
		bottom: clamp(18px, 5vw, 46px);
		color: rgba(251, 245, 233, 0.1);
		font-size: clamp(46px, 11vw, 128px);
		font-weight: 900;
		line-height: 1;
		word-spacing: 0.08em;
	}

	.eyebrow,
	.section-heading p,
	.room-strip p,
	.pile-zone p,
	.action-bar p,
	.hand-head p,
	.join-title p {
		margin: 0;
		color: #d8a647;
		font-size: 11px;
		font-weight: 900;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	h1,
	h2 {
		margin: 0;
		letter-spacing: 0;
	}

	h1 {
		position: relative;
		z-index: 1;
		font-size: clamp(64px, 14vw, 164px);
		line-height: 0.86;
		font-weight: 950;
		text-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
	}

	h2 {
		font-size: 22px;
	}

	.table-meter {
		position: relative;
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 28px;
	}

	.table-meter span,
	.table-flags span,
	.room-strip div {
		border: 1px solid rgba(251, 245, 233, 0.15);
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.2);
	}

	.table-meter span {
		padding: 8px 10px;
		color: #f7e9c3;
		font-size: 12px;
		font-weight: 800;
	}

	.join-board,
	.seat-rail,
	.table-stage,
	.hand-dock,
	.rules-board,
	.log-board {
		border: 1px solid rgba(251, 245, 233, 0.14);
		border-radius: 8px;
		background: rgba(18, 15, 12, 0.78);
		box-shadow: 0 18px 54px rgba(0, 0, 0, 0.28);
		backdrop-filter: blur(14px);
	}

	.join-board {
		display: grid;
		gap: 16px;
		align-content: center;
		padding: 22px;
	}

	.join-title {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		align-items: baseline;
		padding-bottom: 12px;
		border-bottom: 1px solid rgba(251, 245, 233, 0.12);
	}

	.join-title strong {
		font-size: 24px;
		overflow-wrap: anywhere;
		text-align: right;
	}

	label,
	.endpoint {
		display: grid;
		gap: 8px;
		color: #f7e9c3;
		font-size: 13px;
		font-weight: 800;
	}

	input {
		width: 100%;
		min-height: 44px;
		border: 1px solid rgba(251, 245, 233, 0.18);
		border-radius: 6px;
		background: rgba(5, 24, 20, 0.75);
		color: #fffaf0;
		padding: 11px 12px;
		outline: none;
	}

	input:focus {
		border-color: #d8a647;
		box-shadow: 0 0 0 3px rgba(216, 166, 71, 0.18);
	}

	.join-actions {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr) max-content;
		gap: 10px;
		align-items: end;
	}

	.endpoint {
		border-top: 1px solid rgba(251, 245, 233, 0.12);
		padding-top: 12px;
	}

	.endpoint summary {
		cursor: pointer;
		color: #d8a647;
	}

	.button {
		min-height: 44px;
		border: 1px solid rgba(251, 245, 233, 0.14);
		border-radius: 6px;
		padding: 0 16px;
		color: #fffaf0;
		font-weight: 900;
		background: rgba(251, 245, 233, 0.1);
	}

	.button.primary {
		border-color: rgba(216, 166, 71, 0.42);
		background: linear-gradient(135deg, #f0cf77, #d8a647 54%, #a4483b);
		color: #190f09;
	}

	.button.secondary {
		background: rgba(7, 31, 26, 0.9);
	}

	.error {
		margin: 0;
		border: 1px solid rgba(202, 45, 58, 0.42);
		border-radius: 6px;
		background: rgba(202, 45, 58, 0.15);
		color: #ffd9d9;
		padding: 11px 12px;
		font-weight: 800;
	}

	.room-strip {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 10px;
		margin-top: 18px;
	}

	.room-strip div {
		padding: 12px;
	}

	.room-strip strong {
		display: block;
		margin-top: 4px;
		font-size: 18px;
	}

	.table-layout {
		display: grid;
		grid-template-columns: 310px minmax(0, 1fr);
		gap: 18px;
		margin-top: 18px;
	}

	.seat-rail,
	.rules-board,
	.log-board {
		padding: 18px;
	}

	.seat-list {
		display: grid;
		gap: 10px;
		margin-top: 16px;
	}

	.seat-row {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr);
		gap: 12px;
		align-items: center;
		border: 1px solid rgba(251, 245, 233, 0.1);
		border-radius: 8px;
		padding: 10px;
		background: rgba(251, 245, 233, 0.05);
	}

	.seat-row > span {
		width: 42px;
		height: 42px;
		display: grid;
		place-items: center;
		border-radius: 6px;
		background: #fbf5e9;
		color: #17130f;
		font-weight: 950;
	}

	.seat-row strong {
		display: block;
		overflow-wrap: anywhere;
	}

	.seat-row p {
		margin: 3px 0 0;
		color: #cdbf9e;
		font-size: 13px;
	}

	.seat-row.active {
		border-color: rgba(216, 166, 71, 0.72);
		box-shadow: inset 0 0 0 1px rgba(216, 166, 71, 0.22);
	}

	.seat-row.me {
		background: rgba(12, 69, 54, 0.48);
	}

	.table-stage {
		padding: 18px;
	}

	.table-flags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
		min-height: 34px;
	}

	.table-flags span {
		padding: 7px 10px;
		color: #8f8067;
		font-size: 12px;
		font-weight: 900;
	}

	.table-flags span.lit {
		border-color: rgba(202, 45, 58, 0.55);
		color: #ffd9d9;
		background: rgba(202, 45, 58, 0.18);
	}

	.felt {
		position: relative;
		display: grid;
		place-items: center;
		min-height: 370px;
		margin-top: 14px;
		border: 12px solid #4f241b;
		border-radius: 999px;
		background:
			radial-gradient(circle at 50% 50%, rgba(251, 245, 233, 0.1), transparent 28%),
			radial-gradient(circle at 50% 50%, #0f5a46, #0a3a30 64%, #07261f);
		box-shadow:
			inset 0 0 0 2px rgba(251, 245, 233, 0.12),
			inset 0 24px 70px rgba(0, 0, 0, 0.32);
		overflow: hidden;
	}

	.felt-ring {
		position: absolute;
		inset: 32px;
		border: 1px dashed rgba(251, 245, 233, 0.2);
		border-radius: 999px;
	}

	.pile-zone {
		position: relative;
		z-index: 1;
		display: grid;
		gap: 14px;
		place-items: center;
		text-align: center;
	}

	.played-cards,
	.hand-track {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
	}

	.playing-card {
		width: 72px;
		height: 102px;
		display: grid;
		grid-template-rows: 1fr auto;
		align-items: start;
		border: 1px solid #d9cfbd;
		border-radius: 8px;
		background:
			linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(248, 239, 222, 0.98)),
			#fffaf0;
		color: #11100d;
		padding: 9px;
		box-shadow: 0 14px 24px rgba(0, 0, 0, 0.28);
		font-weight: 950;
	}

	.playing-card span {
		font-size: 20px;
	}

	.playing-card b {
		align-self: end;
		justify-self: end;
		font-size: 22px;
		line-height: 1;
	}

	.playing-card.red {
		color: #b62631;
	}

	.playing-card.joker {
		background:
			linear-gradient(135deg, rgba(25, 16, 14, 0.95), rgba(76, 37, 31, 0.96)),
			#211310;
		color: #f0cf77;
		border-color: rgba(240, 207, 119, 0.5);
	}

	.empty-pile {
		width: min(340px, 68vw);
		border: 1px dashed rgba(251, 245, 233, 0.35);
		border-radius: 8px;
		padding: 34px 20px;
		color: rgba(251, 245, 233, 0.46);
		font-size: clamp(34px, 8vw, 72px);
		font-weight: 950;
		letter-spacing: 0;
	}

	.action-bar,
	.hand-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-top: 16px;
	}

	.action-bar strong,
	.hand-head strong {
		font-size: 22px;
	}

	.action-buttons {
		display: flex;
		gap: 10px;
	}

	.hand-dock {
		margin-top: 18px;
		padding: 18px;
	}

	.hand-track {
		justify-content: flex-start;
		min-height: 128px;
		margin-top: 16px;
		padding-top: 14px;
		overflow-x: auto;
		flex-wrap: nowrap;
	}

	button.playing-card {
		flex: 0 0 auto;
		cursor: pointer;
		transition:
			transform 140ms ease,
			box-shadow 140ms ease,
			border-color 140ms ease;
	}

	button.playing-card:hover,
	button.playing-card.selected {
		transform: translateY(-12px);
		border-color: #d8a647;
		box-shadow:
			0 18px 32px rgba(0, 0, 0, 0.34),
			0 0 0 3px rgba(216, 166, 71, 0.18);
	}

	.lower-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
		gap: 18px;
		margin-top: 18px;
	}

	.rule-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 10px;
		margin-top: 16px;
	}

	.rule-toggle {
		display: grid;
		grid-template-columns: 18px minmax(0, 1fr);
		gap: 10px;
		align-items: start;
		border: 1px solid rgba(251, 245, 233, 0.1);
		border-radius: 8px;
		padding: 10px;
		background: rgba(251, 245, 233, 0.04);
	}

	.rule-toggle input {
		width: 18px;
		min-height: 18px;
		accent-color: #d8a647;
	}

	.rule-toggle span {
		color: #fbf5e9;
		font-size: 13px;
		line-height: 1.5;
	}

	.log-list {
		display: grid;
		gap: 10px;
		max-height: 330px;
		overflow: auto;
		margin-top: 16px;
	}

	.log-list p {
		margin: 0;
		border-bottom: 1px solid rgba(251, 245, 233, 0.1);
		padding-bottom: 10px;
		color: #fbf5e9;
		line-height: 1.5;
	}

	.log-list time {
		margin-right: 10px;
		color: #d8a647;
		font-weight: 900;
	}

	@media (max-width: 920px) {
		.entry-band,
		.table-layout,
		.lower-grid {
			grid-template-columns: 1fr;
		}

		.room-strip {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.join-actions {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 560px) {
		.app-shell {
			width: min(100% - 18px, 1240px);
			padding-top: 10px;
		}

		.brand-block,
		.join-board,
		.seat-rail,
		.table-stage,
		.hand-dock,
		.rules-board,
		.log-board {
			padding: 14px;
		}

		.room-strip {
			grid-template-columns: 1fr;
		}

		.felt {
			min-height: 290px;
			border-width: 8px;
		}

		h1 {
			font-size: clamp(52px, 25vw, 92px);
		}

		.join-title {
			align-items: flex-start;
			flex-direction: column;
		}

		.join-title strong {
			text-align: left;
		}

		.action-bar,
		.hand-head {
			align-items: stretch;
			flex-direction: column;
		}

		.action-buttons {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}

		.button {
			width: 100%;
		}
	}
</style>
