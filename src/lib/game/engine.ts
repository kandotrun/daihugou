import { nanoid } from 'nanoid';
import type { Card, Player, PublicRoomState, Rank, RoomState, Suit } from './types';

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const RANK_LABELS: Record<Rank, string> = {
	3: '3',
	4: '4',
	5: '5',
	6: '6',
	7: '7',
	8: '8',
	9: '9',
	10: '10',
	11: 'J',
	12: 'Q',
	13: 'K',
	14: 'A',
	15: '2',
	16: 'Joker',
};

export const suitMarks: Record<Suit, string> = {
	spades: '♠',
	hearts: '♥',
	diamonds: '♦',
	clubs: '♣',
	joker: '🃏',
};

export function createRoom(id = nanoid(8)): RoomState {
	const now = Date.now();
	return {
		id,
		phase: 'lobby',
		players: [],
		hands: {},
		passes: [],
		winners: [],
		revolution: false,
		decks: 1,
		log: [{ id: nanoid(), message: '部屋を作成しました', at: now }],
		createdAt: now,
		updatedAt: now,
	};
}

export function toPublicState(state: RoomState, viewerId?: string): PublicRoomState {
	const handCounts = Object.fromEntries(
		state.players.map((player) => [player.id, state.hands[player.id]?.length ?? 0]),
	);
	return {
		...state,
		handCounts,
		me: viewerId
			? {
					playerId: viewerId,
					hand: sortHand(state.hands[viewerId] ?? []),
				}
			: undefined,
	};
}

export function joinRoom(state: RoomState, name: string, requestedPlayerId?: string): Player {
	const trimmed = name.trim().slice(0, 24) || '名無し';
	const returning = requestedPlayerId
		? state.players.find((player) => player.id === requestedPlayerId)
		: undefined;
	if (returning) {
		returning.name = trimmed;
		returning.connected = true;
		state.updatedAt = Date.now();
		pushLog(state, `${trimmed} が戻りました`);
		return returning;
	}
	if (state.phase !== 'lobby') {
		throw new Error('ゲーム開始後の途中参加は次のラウンドからです');
	}
	const player: Player = {
		id: nanoid(10),
		name: trimmed,
		connected: true,
		joinedAt: Date.now(),
	};
	state.players.push(player);
	state.hands[player.id] = [];
	state.updatedAt = Date.now();
	pushLog(state, `${trimmed} が参加しました`);
	return player;
}

export function markDisconnected(state: RoomState, playerId?: string) {
	const player = state.players.find((candidate) => candidate.id === playerId);
	if (!player) return;
	player.connected = false;
	state.updatedAt = Date.now();
}

export function startGame(state: RoomState) {
	if (state.phase !== 'lobby') throw new Error('この部屋はすでに開始しています');
	if (state.players.length < 2) throw new Error('2人以上で開始できます');
	state.phase = 'playing';
	state.winners = [];
	state.passes = [];
	state.pile = undefined;
	state.revolution = false;
	state.decks = Math.max(1, Math.ceil(state.players.length / 8));
	const deck = shuffle(createDeck(state.decks));
	state.hands = Object.fromEntries(state.players.map((player) => [player.id, []]));
	for (let i = 0; i < deck.length; i += 1) {
		const player = state.players[i % state.players.length];
		state.hands[player.id].push(deck[i]);
	}
	for (const player of state.players) state.hands[player.id] = sortHand(state.hands[player.id]);
	state.turnPlayerId = findStartingPlayer(state) ?? state.players[0]?.id;
	state.updatedAt = Date.now();
	pushLog(state, `${state.players.length}人・${state.decks}デッキで開始しました`);
}

export function playCards(state: RoomState, playerId: string, cardIds: string[]) {
	assertTurn(state, playerId);
	const hand = state.hands[playerId] ?? [];
	const cards = cardIds.map((id) => hand.find((card) => card.id === id));
	if (cards.some((card) => !card)) throw new Error('手札にないカードが含まれています');
	const selected = cards as Card[];
	const validation = validatePlay(state, selected);
	if (!validation.ok) throw new Error(validation.reason);
	state.hands[playerId] = hand.filter((card) => !cardIds.includes(card.id));
	state.pile = { cards: sortHand(selected), playerId, playedAt: Date.now() };
	state.passes = [];
	if (selected.length >= 4) {
		state.revolution = !state.revolution;
		pushLog(state, `革命！ 強さが${state.revolution ? '逆転' : '通常に戻りました'}`);
	}
	const player = state.players.find((candidate) => candidate.id === playerId);
	pushLog(state, `${player?.name ?? '誰か'} が ${selected.map(cardLabel).join(' ')} を出しました`);
	if (selected.some((card) => card.rank === 8)) {
		state.pile = undefined;
		state.passes = [];
		pushLog(state, '8切りで場が流れました');
	}
	if (state.hands[playerId].length === 0 && !state.winners.includes(playerId)) {
		state.winners.push(playerId);
		const finisher = state.players.find((candidate) => candidate.id === playerId);
		if (finisher) finisher.finishedAt = Date.now();
		pushLog(state, `${finisher?.name ?? '誰か'} が上がりました`);
	}
	advanceTurn(state, playerId);
	state.updatedAt = Date.now();
}

export function passTurn(state: RoomState, playerId: string) {
	assertTurn(state, playerId);
	if (!state.pile) throw new Error('場が空の時はパスできません');
	if (!state.passes.includes(playerId)) state.passes.push(playerId);
	const player = state.players.find((candidate) => candidate.id === playerId);
	pushLog(state, `${player?.name ?? '誰か'} がパスしました`);
	const active = activePlayers(state);
	if (state.passes.length >= Math.max(0, active.length - 1)) {
		const lastPlayerId = state.pile.playerId;
		state.pile = undefined;
		state.passes = [];
		state.turnPlayerId =
			active.find((player) => player.id === lastPlayerId)?.id ?? nextActiveAfter(state, playerId);
		pushLog(state, '全員パスで場が流れました');
	} else {
		state.turnPlayerId = nextActiveAfter(state, playerId);
	}
	state.updatedAt = Date.now();
}

export function resetRoom(state: RoomState) {
	const fresh = createRoom(state.id);
	fresh.players = state.players.map((player) => ({
		id: player.id,
		name: player.name,
		connected: player.connected,
		joinedAt: player.joinedAt,
	}));
	fresh.hands = Object.fromEntries(fresh.players.map((player) => [player.id, []]));
	Object.assign(state, fresh);
	pushLog(state, '新しいラウンド待機に戻しました');
}

export function cardLabel(card: Card) {
	return card.suit === 'joker' ? 'Joker' : `${suitMarks[card.suit]}${RANK_LABELS[card.rank]}`;
}

export function sortHand(cards: Card[]) {
	return [...cards].sort(
		(a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit) || a.deck - b.deck,
	);
}

function createDeck(decks: number): Card[] {
	const cards: Card[] = [];
	for (let deck = 1; deck <= decks; deck += 1) {
		for (const suit of SUITS) {
			for (const rank of RANKS) {
				cards.push({
					id: `${deck}-${suit}-${rank}-${nanoid(4)}`,
					suit,
					rank,
					label: RANK_LABELS[rank],
					deck,
				});
			}
		}
		cards.push({
			id: `${deck}-joker-black-${nanoid(4)}`,
			suit: 'joker',
			rank: 16,
			label: 'Joker',
			deck,
		});
		cards.push({
			id: `${deck}-joker-red-${nanoid(4)}`,
			suit: 'joker',
			rank: 16,
			label: 'Joker',
			deck,
		});
	}
	return cards;
}

function shuffle<T>(items: T[]): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

function findStartingPlayer(state: RoomState) {
	return state.players.find((player) =>
		state.hands[player.id]?.some((card) => card.rank === 3 && card.suit === 'diamonds'),
	)?.id;
}

function validatePlay(
	state: RoomState,
	selected: Card[],
): { ok: true } | { ok: false; reason: string } {
	if (selected.length === 0) return { ok: false, reason: 'カードを選んでください' };
	const nonJokerRanks = [
		...new Set(selected.filter((card) => card.rank !== 16).map((card) => card.rank)),
	];
	if (nonJokerRanks.length > 1)
		return { ok: false, reason: '同じ数字の組だけ出せます（階段は今後対応）' };
	const selectedRank = effectiveRank(selected);
	if (!state.pile) return { ok: true };
	if (selected.length !== state.pile.cards.length)
		return { ok: false, reason: `場と同じ${state.pile.cards.length}枚で出してください` };
	const pileRank = effectiveRank(state.pile.cards);
	const stronger = state.revolution ? selectedRank < pileRank : selectedRank > pileRank;
	if (!stronger)
		return {
			ok: false,
			reason: state.revolution ? '革命中はより弱い数字を出します' : 'より強い数字を出してください',
		};
	return { ok: true };
}

function effectiveRank(cards: Card[]): number {
	const nonJoker = cards.filter((card) => card.rank !== 16);
	return nonJoker[0]?.rank ?? 16;
}

function assertTurn(state: RoomState, playerId: string) {
	if (state.phase !== 'playing') throw new Error('まだゲームが始まっていません');
	if (state.turnPlayerId !== playerId) throw new Error('今はあなたの番ではありません');
	if (state.winners.includes(playerId)) throw new Error('すでに上がっています');
}

function activePlayers(state: RoomState) {
	return state.players.filter(
		(player) => !state.winners.includes(player.id) && (state.hands[player.id]?.length ?? 0) > 0,
	);
}

function nextActiveAfter(state: RoomState, playerId: string) {
	const players = state.players;
	const activeIds = new Set(activePlayers(state).map((player) => player.id));
	if (activeIds.size <= 1) {
		state.phase = 'finished';
		const remaining = players.find((player) => activeIds.has(player.id));
		if (remaining && !state.winners.includes(remaining.id)) state.winners.push(remaining.id);
		pushLog(state, 'ゲーム終了です');
		return undefined;
	}
	const index = players.findIndex((player) => player.id === playerId);
	for (let step = 1; step <= players.length; step += 1) {
		const next = players[(index + step) % players.length];
		if (activeIds.has(next.id)) return next.id;
	}
	return undefined;
}

function advanceTurn(state: RoomState, currentPlayerId: string) {
	state.turnPlayerId = nextActiveAfter(state, currentPlayerId);
}

function pushLog(state: RoomState, message: string) {
	state.log = [{ id: nanoid(), message, at: Date.now() }, ...state.log].slice(0, 80);
}
