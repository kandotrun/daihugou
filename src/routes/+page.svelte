<script lang="ts">
import { connectRoom, createRoom, setApiBase } from '$lib/game/client';
import { cardLabel, ruleDescriptions } from '$lib/game/engine';
import type { Card, PublicRoomState, RuleSettings } from '$lib/game/types';

let name = 'Player';
let roomId = '';
let apiBaseInput = '';
let playerId = '';
let state: PublicRoomState | undefined;
let selected = new Set<string>();
let error = '';
let client: ReturnType<typeof connectRoom> | undefined;

const isMyTurn = () => state?.turnPlayerId === playerId;
const me = () => state?.players.find((player) => player.id === playerId);
const currentPlayer = () => state?.players.find((player) => player.id === state?.turnPlayerId);
const ruleEntries = Object.entries(ruleDescriptions) as [keyof RuleSettings, string][];

function setRule(key: keyof RuleSettings, checked: boolean) {
	client?.send({ type: 'updateRules', rules: { [key]: checked } });
}

async function handleCreateRoom() {
	error = '';
	try {
		if (apiBaseInput.trim()) setApiBase(apiBaseInput.trim());
		const created = await createRoom();
		roomId = created.roomId;
		connect();
	} catch (reason) {
		error = reason instanceof Error ? reason.message : '部屋を作成できませんでした';
	}
}

function connect() {
	error = '';
	if (apiBaseInput.trim()) setApiBase(apiBaseInput.trim());
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
</script>

<svelte:head>
	<title>大富豪 Online</title>
	<meta name="description" content="Cloudflare Workersで動く多人数対応の大富豪Webアプリ" />
</svelte:head>

<main class="shell">
	<section class="hero">
		<div>
			<p class="eyebrow">Daifugō / President</p>
			<h1>大富豪 Online</h1>
			<p class="lead">4人制限なし。人数に応じてデッキを増やす、Cloudflare Workers + Durable Objects 前提のリアルタイム大富豪MVPです。</p>
		</div>
		<div class="panel join-panel">
			<label>
				名前
				<input bind:value={name} placeholder="Kan" />
			</label>
			<label>
				API Base（ローカルWorker等。空なら同一オリジン）
				<input bind:value={apiBaseInput} placeholder="http://localhost:8787" />
			</label>
			<div class="row">
				<button class="primary" on:click={handleCreateRoom}>部屋を作る</button>
				<input class="room-input" bind:value={roomId} placeholder="room id" />
				<button on:click={connect} disabled={!roomId}>参加</button>
			</div>
			{#if error}<p class="error">{error}</p>{/if}
		</div>
	</section>

	{#if state}
		<section class="game-grid">
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
						{#if state.pile?.lockSuits.length}<span class="danger">縛り {state.pile.lockSuits.map((suit) => ({ spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣', joker: '🃏' })[suit]).join('')}</span>{/if}
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
						<button class="primary" on:click={() => client?.send({ type: 'start' })} disabled={state.players.length < 2}>開始</button>
					{:else if state.phase === 'playing'}
						<strong>{currentPlayer()?.name ?? '誰か'} の番</strong>
						<button class="primary" on:click={play} disabled={!isMyTurn() || selected.size === 0}>出す</button>
						<button on:click={pass} disabled={!isMyTurn() || !state.pile}>パス</button>
					{:else}
						<button class="primary" on:click={() => client?.send({ type: 'reset' })}>次のラウンドへ</button>
					{/if}
				</div>
			</div>

			<aside class="panel players">
				<h2>Players</h2>
				{#each state.players as player, index (player.id)}
					<div class:active={player.id === state.turnPlayerId} class:me={player.id === playerId} class="player-row">
						<span>{state.winners.indexOf(player.id) >= 0 ? `#${state.winners.indexOf(player.id) + 1}` : index + 1}</span>
						<div>
							<strong>{player.name}{player.id === playerId ? '（あなた）' : ''}</strong>
							<p>{state.handCounts[player.id] ?? 0}枚 / {player.connected ? 'online' : 'offline'}</p>
						</div>
					</div>
				{/each}
			</aside>
		</section>

		<section class="panel rules-panel">
			<div class="statusbar">
				<div>
					<p class="muted">Rule toggles</p>
					<h2>大富豪ルール設定</h2>
				</div>
				<p>{state.phase === 'lobby' ? '開始前のみ変更できます' : '進行中は固定'}</p>
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
		</section>

		<section class="panel hand-panel">
			<div class="statusbar">
				<div>
					<p class="muted">Your hand</p>
					<h2>{me()?.name ?? name}</h2>
				</div>
				<p>{selected.size}枚選択中</p>
			</div>
			<div class="cards hand">
				{#each state.me?.hand ?? [] as card (card.id)}
					<button class:selected={selected.has(card.id)} class="card" on:click={() => toggle(card)}>{cardLabel(card)}</button>
				{/each}
			</div>
		</section>

		<section class="panel log">
			<h2>Log</h2>
			{#each state.log as entry (entry.id)}
				<p><time>{new Date(entry.at).toLocaleTimeString('ja-JP')}</time> {entry.message}</p>
			{/each}
		</section>
	{/if}
</main>

<style>
	.shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 64px; }
	.hero { display: grid; grid-template-columns: 1.1fr .9fr; gap: 24px; align-items: center; min-height: 340px; }
	.eyebrow { color: #38bdf8; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(42px, 9vw, 96px); letter-spacing: -.08em; }
	.lead { color: #cbd5e1; font-size: 18px; line-height: 1.8; max-width: 700px; }
	.panel { border: 1px solid rgba(148,163,184,.2); border-radius: 28px; background: linear-gradient(145deg, rgba(15,23,42,.92), rgba(30,41,59,.72)); box-shadow: 0 20px 80px rgba(0,0,0,.25); padding: 22px; }
	.join-panel { display: grid; gap: 14px; }
	label { display: grid; gap: 8px; color: #cbd5e1; font-size: 13px; }
	input { width: 100%; border: 1px solid rgba(148,163,184,.25); border-radius: 14px; background: rgba(2,6,23,.75); color: #fff; padding: 12px 14px; }
	.row { display: flex; gap: 10px; align-items: center; }
	.room-input { flex: 1; min-width: 0; }
	button { border: 0; border-radius: 999px; background: rgba(148,163,184,.18); color: #fff; padding: 12px 18px; font-weight: 800; }
	button.primary { background: linear-gradient(135deg, #22c55e, #14b8a6); color: #03140d; }
	.error { color: #fecaca; background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.25); border-radius: 14px; padding: 10px 12px; }
	.game-grid { display: grid; grid-template-columns: 1fr 320px; gap: 20px; margin-top: 18px; }
	.statusbar { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
	h2 { margin: 0; }
	.muted { color: #94a3b8; margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }
	.badges { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
	.badges span { border: 1px solid rgba(148,163,184,.22); border-radius: 999px; color: #cbd5e1; padding: 6px 10px; font-size: 12px; }
	.badges .danger { color: #fecaca; border-color: rgba(248,113,113,.4); }
	.pile { min-height: 210px; display: grid; place-content: center; text-align: center; }
	.empty { color: #94a3b8; border: 1px dashed rgba(148,163,184,.28); border-radius: 22px; padding: 36px; }
	.cards { display: flex; flex-wrap: wrap; gap: 10px; }
	.center { justify-content: center; }
	.card { min-width: 66px; height: 92px; display: grid; place-items: center; border-radius: 16px; background: #f8fafc; color: #0f172a; border: 2px solid rgba(15,23,42,.08); box-shadow: 0 12px 24px rgba(0,0,0,.2); }
	button.card { border-radius: 16px; padding: 0; transition: transform .15s ease, border-color .15s ease; }
	button.card.selected { transform: translateY(-14px); border-color: #38bdf8; }
	.table-card { transform: rotate(-2deg); }
	.controls { display: flex; gap: 12px; align-items: center; justify-content: center; min-height: 54px; }
	.players { display: grid; gap: 12px; align-content: start; }
	.player-row { display: grid; grid-template-columns: 34px 1fr; gap: 12px; align-items: center; border: 1px solid rgba(148,163,184,.14); border-radius: 18px; padding: 12px; }
	.player-row span { width: 34px; height: 34px; border-radius: 50%; background: rgba(148,163,184,.16); display: grid; place-items: center; font-weight: 900; }
	.player-row p { margin: 2px 0 0; color: #94a3b8; font-size: 13px; }
	.player-row.active { border-color: rgba(56,189,248,.7); box-shadow: 0 0 0 1px rgba(56,189,248,.2); }
	.player-row.me { background: rgba(34,197,94,.08); }
	.hand-panel, .log, .rules-panel { margin-top: 20px; }
	.rule-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-top: 18px; }
	.rule-toggle { display: flex; grid-template-columns: none; align-items: center; gap: 10px; border: 1px solid rgba(148,163,184,.14); border-radius: 16px; padding: 12px; }
	.rule-toggle input { width: auto; accent-color: #22c55e; }
	.rule-toggle span { color: #e2e8f0; }
	.hand { padding-top: 20px; min-height: 130px; }
	.log { max-height: 320px; overflow: auto; }
	.log p { color: #cbd5e1; border-bottom: 1px solid rgba(148,163,184,.1); padding-bottom: 8px; }
	.log time { color: #64748b; margin-right: 8px; }
	@media (max-width: 820px) { .hero, .game-grid { grid-template-columns: 1fr; } .statusbar, .row { align-items: stretch; flex-direction: column; } }
</style>
