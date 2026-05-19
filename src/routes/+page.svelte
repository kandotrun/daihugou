<script lang="ts">
import GameLog from '$lib/components/GameLog.svelte';
import HandPanel from '$lib/components/HandPanel.svelte';
import JoinPanel from '$lib/components/JoinPanel.svelte';
import PlayersPanel from '$lib/components/PlayersPanel.svelte';
import RuleSettingsPanel from '$lib/components/RuleSettingsPanel.svelte';
import TablePanel from '$lib/components/TablePanel.svelte';
import { apiBase, connectRoom, createRoom, setApiBase } from '$lib/game/client';
import { ruleDescriptions } from '$lib/game/engine';
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
	const normalizedRoomId = roomId.trim().toLowerCase();
	roomId = normalizedRoomId;
	client?.close();
	client = connectRoom({
		roomId: normalizedRoomId,
		name,
		playerId: localStorage.getItem(`daihugou:${normalizedRoomId}:playerId`) ?? undefined,
		onState(next) {
			state = next;
			selected = new Set(
				[...selected].filter((id) => next.me?.hand.some((card) => card.id === id)),
			);
		},
		onJoined(nextPlayerId) {
			playerId = nextPlayerId;
			localStorage.setItem(`daihugou:${normalizedRoomId}:playerId`, nextPlayerId);
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

function activeApiBase() {
	return apiBaseInput.trim() || apiBase() || '同一オリジン';
}
</script>

<svelte:head>
	<title>大富豪 Online</title>
	<meta name="description" content="Cloudflare Workersで動く多人数対応の大富豪Webアプリ" />
</svelte:head>

<main class="shell">
	<JoinPanel
		bind:name
		bind:roomId
		bind:apiBaseInput
		activeApiBase={activeApiBase()}
		{error}
		onCreateRoom={handleCreateRoom}
		onConnect={connect}
	/>

	{#if state}
		<section class="game-grid">
			<TablePanel
				{state}
				selectedCount={selected.size}
				isMyTurn={isMyTurn()}
				onStart={() => client?.send({ type: 'start' })}
				onPlay={play}
				onPass={pass}
				onReset={() => client?.send({ type: 'reset' })}
			/>
			<PlayersPanel {state} {playerId} />
		</section>

		<RuleSettingsPanel {state} {ruleEntries} onRuleChange={setRule} />
		<HandPanel hand={state.me?.hand ?? []} playerName={me()?.name ?? name} {selected} onToggle={toggle} />
		<GameLog entries={state.log} />
	{/if}
</main>
