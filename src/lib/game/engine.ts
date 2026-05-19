import { nanoid } from 'nanoid';
import type {
	Card,
	Combination,
	Player,
	PublicRoomState,
	Rank,
	RoomState,
	RuleSettings,
	Suit,
} from './types';

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const JOKER_RANK = 16;
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

export const defaultRules: RuleSettings = {
	sequence: true,
	suitLock: true,
	eightCut: true,
	revolution: true,
	elevenBack: true,
	spade3BeatsJoker: true,
	forbiddenFinish: true,
	skip5: true,
	reverse9: true,
};

export const ruleDescriptions: Record<keyof RuleSettings, string> = {
	sequence: '階段（同じマークの連番3枚以上）',
	suitLock: '縛り（同じマーク続きで場を固定）',
	eightCut: '8切り（8を含む手で場流し）',
	revolution: '革命（4枚以上、または5枚以上の階段で強弱反転）',
	elevenBack: '11バック（Jを含む手で場が流れるまで強弱反転）',
	spade3BeatsJoker: 'スペ3返し（Joker単騎に♠3単騎で返せる）',
	forbiddenFinish: '反則上がり（Joker/2/8/Jなどで上がれない）',
	skip5: '5飛ばし（5を含む手で次の人を飛ばす）',
	reverse9: '9リバース（9を含む手で順番を反転）',
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
		jackBack: false,
		turnDirection: 1,
		decks: 1,
		rules: { ...defaultRules },
		log: [{ id: nanoid(), message: '部屋を作成しました', at: now }],
		createdAt: now,
		updatedAt: now,
	};
}

export function toPublicState(state: RoomState, viewerId?: string): PublicRoomState {
	migrateState(state);
	const handCounts = Object.fromEntries(
		state.players.map((player) => [player.id, state.hands[player.id]?.length ?? 0]),
	);
	const { hands: _privateHands, ...publicState } = state;
	return {
		...publicState,
		handCounts,
		me: viewerId
			? {
					playerId: viewerId,
					hand: sortHand(state.hands[viewerId] ?? []),
				}
			: undefined,
	};
}

export function updateRules(state: RoomState, rules: Partial<RuleSettings>) {
	migrateState(state);
	if (state.phase !== 'lobby') throw new Error('ルール変更は開始前のみ可能です');
	state.rules = { ...state.rules, ...rules };
	state.updatedAt = Date.now();
	pushLog(state, 'ルール設定を更新しました');
}

export function joinRoom(state: RoomState, name: string, requestedPlayerId?: string): Player {
	migrateState(state);
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
	if (state.phase !== 'lobby') throw new Error('ゲーム開始後の途中参加は次のラウンドからです');
	const player: Player = { id: nanoid(10), name: trimmed, connected: true, joinedAt: Date.now() };
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
	migrateState(state);
	if (state.phase !== 'lobby') throw new Error('この部屋はすでに開始しています');
	if (state.players.length < 2) throw new Error('2人以上で開始できます');
	state.phase = 'playing';
	state.winners = [];
	state.passes = [];
	state.pile = undefined;
	state.revolution = false;
	state.jackBack = false;
	state.turnDirection = 1;
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
	migrateState(state);
	assertTurn(state, playerId);
	const hand = state.hands[playerId] ?? [];
	const cards = cardIds.map((id) => hand.find((card) => card.id === id));
	if (cards.some((card) => !card)) throw new Error('手札にないカードが含まれています');
	const selected = cards as Card[];
	const validation = validatePlay(state, selected);
	if (!validation.ok) throw new Error(validation.reason);
	const wouldFinish = hand.length === selected.length;
	if (
		wouldFinish &&
		state.rules.forbiddenFinish &&
		isForbiddenFinish(state, selected, validation.combination)
	) {
		throw new Error('反則上がり対象のカードでは上がれません');
	}
	state.hands[playerId] = hand.filter((card) => !cardIds.includes(card.id));
	const previousPile = state.pile;
	state.pile = {
		cards: sortHand(selected),
		playerId,
		playedAt: Date.now(),
		combination: validation.combination,
		lockSuits: lockSuitsFor(state, previousPile?.combination, validation.combination),
	};
	state.passes = [];
	const player = state.players.find((candidate) => candidate.id === playerId);
	pushLog(state, `${player?.name ?? '誰か'} が ${selected.map(cardLabel).join(' ')} を出しました`);
	if (state.hands[playerId].length === 0 && !state.winners.includes(playerId)) {
		state.winners.push(playerId);
		const finisher = state.players.find((candidate) => candidate.id === playerId);
		if (finisher) finisher.finishedAt = Date.now();
		pushLog(state, `${finisher?.name ?? '誰か'} が上がりました`);
	}
	applyRuleEffects(state, validation.combination);
	advanceTurn(state, playerId, validation.combination);
	state.updatedAt = Date.now();
}

export function passTurn(state: RoomState, playerId: string) {
	migrateState(state);
	assertTurn(state, playerId);
	if (!state.pile) throw new Error('場が空の時はパスできません');
	if (!state.passes.includes(playerId)) state.passes.push(playerId);
	const player = state.players.find((candidate) => candidate.id === playerId);
	pushLog(state, `${player?.name ?? '誰か'} がパスしました`);
	const active = activePlayers(state);
	if (state.passes.length >= Math.max(0, active.length - 1)) clearPile(state, state.pile.playerId);
	else state.turnPlayerId = nextActiveAfter(state, playerId);
	state.updatedAt = Date.now();
}

export function resetRoom(state: RoomState) {
	migrateState(state);
	const rules = { ...state.rules };
	const fresh = createRoom(state.id);
	fresh.rules = rules;
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

function validatePlay(
	state: RoomState,
	selected: Card[],
): { ok: true; combination: Combination } | { ok: false; reason: string } {
	if (selected.length === 0) return { ok: false, reason: 'カードを選んでください' };
	const combination = detectCombination(selected, state.rules.sequence);
	if (!combination)
		return { ok: false, reason: '同じ数字の組、または同じマークの階段で出してください' };
	if (!state.pile) return { ok: true, combination };
	const current = state.pile.combination;
	if (state.rules.spade3BeatsJoker && isSpade3JokerCounter(selected, state.pile.cards))
		return { ok: true, combination };
	if (combination.kind !== current.kind || combination.count !== current.count) {
		return { ok: false, reason: `場と同じ種類・${current.count}枚で出してください` };
	}
	if (!passesSuitLock(state.pile.lockSuits, combination)) {
		return {
			ok: false,
			reason: `${state.pile.lockSuits.map((suit) => suitMarks[suit]).join('')} 縛り中です`,
		};
	}
	const stronger = isInverted(state)
		? combination.rank < current.rank
		: combination.rank > current.rank;
	if (!stronger)
		return {
			ok: false,
			reason: isInverted(state)
				? '革命/11バック中はより弱い数字を出します'
				: 'より強い数字を出してください',
		};
	return { ok: true, combination };
}

function detectCombination(cards: Card[], sequenceEnabled: boolean): Combination | undefined {
	const jokers = cards.filter((card) => card.rank === JOKER_RANK);
	const normal = cards.filter((card) => card.rank !== JOKER_RANK);
	const containsRank = Object.fromEntries(cards.map((card) => [card.rank, true]));
	if (cards.length === 1)
		return buildCombination('single', cards, normal[0]?.rank ?? JOKER_RANK, containsRank);
	const ranks = [...new Set(normal.map((card) => card.rank))];
	if (ranks.length <= 1)
		return buildCombination('set', cards, ranks[0] ?? JOKER_RANK, containsRank);
	if (!sequenceEnabled || cards.length < 3) return undefined;
	const normalSuits = [...new Set(normal.map((card) => card.suit))];
	if (normalSuits.length !== 1) return undefined;
	const sortedRanks = [...new Set(normal.map((card) => card.rank))].sort((a, b) => a - b);
	if (sortedRanks.length !== normal.length) return undefined;
	for (let start = 3; start <= 15 - cards.length + 1; start += 1) {
		const needed = Array.from({ length: cards.length }, (_, index) => start + index);
		const missing = needed.filter((rank) => !sortedRanks.includes(rank as Rank)).length;
		if (missing === jokers.length)
			return buildCombination('sequence', cards, needed.at(-1) ?? 15, containsRank);
	}
	return undefined;
}

function buildCombination(
	kind: Combination['kind'],
	cards: Card[],
	rank: number,
	containsRank: Partial<Record<Rank, boolean>>,
): Combination {
	return {
		kind,
		count: cards.length,
		rank,
		suits: cards.filter((card) => card.suit !== 'joker').map((card) => card.suit),
		containsJoker: cards.some((card) => card.rank === JOKER_RANK),
		containsRank,
	};
}

function applyRuleEffects(state: RoomState, combination: Combination) {
	if (state.rules.revolution && causesRevolution(combination)) {
		state.revolution = !state.revolution;
		pushLog(state, `革命！ 強さが${state.revolution ? '逆転' : '通常に戻りました'}`);
	}
	if (state.rules.elevenBack && combination.containsRank[11]) {
		state.jackBack = !state.jackBack;
		pushLog(state, '11バックが発動しました（場が流れるまで強弱反転）');
	}
	if (state.rules.reverse9 && combination.containsRank[9]) {
		state.turnDirection = state.turnDirection === 1 ? -1 : 1;
		pushLog(state, '9リバースで順番が反転しました');
	}
	if (state.rules.eightCut && combination.containsRank[8]) {
		clearPile(state, state.pile?.playerId);
		pushLog(state, '8切りで場が流れました');
	}
}

function advanceTurn(state: RoomState, currentPlayerId: string, combination: Combination) {
	if (state.phase === 'finished') return;
	if (!state.pile) return;
	const skipCount = state.rules.skip5 && combination.containsRank[5] ? combination.count + 1 : 1;
	if (skipCount > 1) pushLog(state, '5飛ばしで次の人をスキップしました');
	state.turnPlayerId = nextActiveAfter(state, currentPlayerId, skipCount);
}

function clearPile(state: RoomState, nextPlayerId?: string) {
	state.pile = undefined;
	state.passes = [];
	state.jackBack = false;
	state.turnPlayerId =
		nextPlayerId && activePlayers(state).some((player) => player.id === nextPlayerId)
			? nextPlayerId
			: nextActiveAfter(state, nextPlayerId ?? state.turnPlayerId ?? '');
	pushLog(state, '場が流れました');
}

function causesRevolution(combination: Combination) {
	return combination.kind === 'set'
		? combination.count >= 4
		: combination.kind === 'sequence' && combination.count >= 5;
}

function lockSuitsFor(state: RoomState, previous: Combination | undefined, current: Combination) {
	if (
		!state.rules.suitLock ||
		!previous ||
		previous.kind !== current.kind ||
		previous.count !== current.count
	)
		return [];
	const previousSuits = normalizeSuits(previous.suits);
	const currentSuits = normalizeSuits(current.suits);
	if (previousSuits.length === 0 || previousSuits.length !== currentSuits.length) return [];
	return previousSuits.every((suit, index) => currentSuits[index] === suit) ? currentSuits : [];
}

function passesSuitLock(lockSuits: Suit[], combination: Combination) {
	if (lockSuits.length === 0) return true;
	const suits = normalizeSuits(combination.suits);
	return lockSuits.every((suit) => suits.includes(suit));
}

function normalizeSuits(suits: Suit[]): Suit[] {
	return [
		...new Set(suits.filter((suit): suit is Exclude<Suit, 'joker'> => suit !== 'joker')),
	].sort();
}

function isInverted(state: RoomState) {
	return state.revolution !== state.jackBack;
}

function isSpade3JokerCounter(selected: Card[], pile: Card[]) {
	return (
		selected.length === 1 &&
		selected[0].rank === 3 &&
		selected[0].suit === 'spades' &&
		pile.length === 1 &&
		pile[0].rank === JOKER_RANK
	);
}

function isForbiddenFinish(state: RoomState, selected: Card[], combination: Combination) {
	return (
		combination.containsJoker ||
		combination.containsRank[15] ||
		(state.rules.eightCut && combination.containsRank[8]) ||
		(state.rules.elevenBack && combination.containsRank[11]) ||
		isSpade3JokerCounter(selected, state.pile?.cards ?? [])
	);
}

function createDeck(decks: number): Card[] {
	const cards: Card[] = [];
	for (let deck = 1; deck <= decks; deck += 1) {
		for (const suit of SUITS) {
			for (const rank of RANKS)
				cards.push({
					id: `${deck}-${suit}-${rank}-${nanoid(4)}`,
					suit,
					rank,
					label: RANK_LABELS[rank],
					deck,
				});
		}
		cards.push({
			id: `${deck}-joker-black-${nanoid(4)}`,
			suit: 'joker',
			rank: JOKER_RANK,
			label: 'Joker',
			deck,
		});
		cards.push({
			id: `${deck}-joker-red-${nanoid(4)}`,
			suit: 'joker',
			rank: JOKER_RANK,
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

function nextActiveAfter(state: RoomState, playerId: string, steps = 1) {
	const players = state.players;
	const activeIds = new Set(activePlayers(state).map((player) => player.id));
	if (activeIds.size <= 1) {
		state.phase = 'finished';
		const remaining = players.find((player) => activeIds.has(player.id));
		if (remaining && !state.winners.includes(remaining.id)) state.winners.push(remaining.id);
		pushLog(state, 'ゲーム終了です');
		return undefined;
	}
	let index = players.findIndex((player) => player.id === playerId);
	if (index < 0) index = 0;
	let remaining = steps;
	for (let guard = 1; guard <= players.length * Math.max(steps, 1) * 2; guard += 1) {
		index = (index + state.turnDirection + players.length) % players.length;
		const next = players[index];
		if (!activeIds.has(next.id)) continue;
		remaining -= 1;
		if (remaining <= 0) return next.id;
	}
	return undefined;
}

function migrateState(state: RoomState) {
	state.rules = { ...defaultRules, ...(state.rules ?? {}) };
	state.jackBack ??= false;
	state.turnDirection ??= 1;
	if (state.pile && !state.pile.combination) {
		const combination = detectCombination(state.pile.cards, state.rules.sequence);
		if (combination) state.pile = { ...state.pile, combination, lockSuits: [] };
	}
}

function pushLog(state: RoomState, message: string) {
	state.log = [{ id: nanoid(), message, at: Date.now() }, ...state.log].slice(0, 80);
}
