import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createRoom,
	defaultRules,
	joinRoom,
	markDisconnected,
	passTurn,
	playCards,
	resetRoom,
	startGame,
	toPublicState,
	updateRules,
} from './engine';
import type { Card, Pile, Rank, RoomState, RuleSettings, Suit } from './types';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({
	id: `${suit}-${rank}`,
	suit,
	rank,
	label: String(rank),
	deck: 1,
});

const singleJokerPile = (playerId = 'p2'): Pile => ({
	cards: [card(16, 'joker')],
	playerId,
	playedAt: 1,
	combination: {
		kind: 'single',
		count: 1,
		rank: 16,
		suits: [],
		containsJoker: true,
		containsRank: { 16: true },
	},
	lockSuits: [],
});

function room(hands: Record<string, Card[]>, rules: Partial<RuleSettings> = {}): RoomState {
	const ids = Object.keys(hands);
	return {
		id: 'room',
		phase: 'playing',
		players: ids.map((id, index) => ({
			id,
			token: `${id}-token`,
			name: id,
			connected: true,
			joinedAt: 1,
			host: index === 0,
		})),
		hands,
		turnPlayerId: ids[0],
		passes: [],
		winners: [],
		revolution: false,
		jackBack: false,
		turnDirection: 1,
		decks: 1,
		rules: { ...defaultRules, ...rules },
		log: [],
		createdAt: 1,
		updatedAt: 1,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('room setup and public state', () => {
	it('trims names, reuses returning players, and rejects late joins', () => {
		const state = createRoom('r');

		const first = joinRoom(state, '  Alice Alice Alice Alice Alice Alice  ');
		const firstName = first.name;
		const returning = joinRoom(state, ' Alice again ', { playerId: first.id, token: first.token });
		joinRoom(state, 'Bob');
		state.phase = 'playing';

		expect(firstName).toHaveLength(23);
		expect(firstName).toBe('Alice Alice Alice Alice');
		expect(returning.id).toBe(first.id);
		expect(returning.name).toBe('Alice again');
		expect(state.players).toHaveLength(2);
		expect(() => joinRoom(state, 'Mallory', { playerId: first.id, token: 'wrong' })).toThrow(
			/トークン/,
		);
		expect(() => joinRoom(state, 'Carol')).toThrow(/途中参加/);
	});

	it('marks disconnected players and restores them through join', () => {
		const state = createRoom('r');
		const player = joinRoom(state, 'Alice');

		markDisconnected(state, player.id);
		expect(state.players[0].connected).toBe(false);

		const returning = joinRoom(state, 'Alice', { playerId: player.id, token: player.token });
		expect(returning.connected).toBe(true);
		expect(state.players).toHaveLength(1);
	});

	it('starts with enough decks, deals every card, and lets diamond three act first', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const state = createRoom('r');
		for (let index = 0; index < 9; index += 1) joinRoom(state, `p${index + 1}`);

		startGame(state);

		const totalCards = Object.values(state.hands).reduce((total, hand) => total + hand.length, 0);
		const startingPlayer = state.players.find((player) => player.id === state.turnPlayerId);

		expect(state.phase).toBe('playing');
		expect(state.decks).toBe(2);
		expect(totalCards).toBe(108);
		expect(
			Object.values(state.hands)
				.map((hand) => hand.length)
				.sort((a, b) => b - a),
		).toEqual([12, 12, 12, 12, 12, 12, 12, 12, 12]);
		expect(state.hands[state.turnPlayerId ?? '']).toContainEqual(
			expect.objectContaining({ rank: 3, suit: 'diamonds' }),
		);
		expect(startingPlayer).toBeDefined();
	});

	it('resets a finished room while preserving players and rule choices', () => {
		const state = createRoom('r');
		const first = joinRoom(state, 'Alice');
		joinRoom(state, 'Bob');
		updateRules(state, { reverse9: false });
		state.phase = 'finished';
		state.winners = [first.id];
		state.hands[first.id] = [card(3)];

		resetRoom(state);

		expect(state.phase).toBe('lobby');
		expect(state.players.map((player) => player.name)).toEqual(['Alice', 'Bob']);
		expect(state.players[0].token).toBe(first.token);
		expect(state.players[0].host).toBe(true);
		expect(state.rules.reverse9).toBe(false);
		expect(state.winners).toEqual([]);
		expect(state.hands).toEqual({ [state.players[0].id]: [], [state.players[1].id]: [] });
	});

	it('updates lobby rules and freezes them after start', () => {
		const state = createRoom('r');
		joinRoom(state, 'a');
		joinRoom(state, 'b');

		updateRules(state, { eightCut: false, sequence: true });

		expect(state.rules.eightCut).toBe(false);
		expect(state.rules.sequence).toBe(true);
		state.phase = 'playing';
		expect(() => updateRules(state, { eightCut: true })).toThrow(/開始前/);
	});

	it('only exposes the viewer hand in public state', () => {
		const state = room({ p1: [card(3), card(4)], p2: [card(10), card(11)] });

		const publicState = toPublicState(state, 'p1');

		expect('hands' in publicState).toBe(false);
		expect('token' in publicState.players[0]).toBe(false);
		expect(publicState.handCounts).toEqual({ p1: 2, p2: 2 });
		expect(publicState.me?.hand.map((ownedCard) => ownedCard.id)).toEqual(['spades-3', 'spades-4']);
		expect(JSON.stringify(publicState)).not.toContain('spades-10');
		expect(JSON.stringify(publicState)).not.toContain('p1-token');
	});
});

describe('play validation', () => {
	it('rejects empty plays, missing cards, early passes, and non-turn actions', () => {
		const state = room({ p1: [card(4)], p2: [card(6)] });

		expect(() => playCards(state, 'p1', [])).toThrow(/選んで/);
		expect(() => playCards(state, 'p1', ['spades-10'])).toThrow(/手札/);
		expect(() => playCards(state, 'p1', ['spades-4', 'spades-4'])).toThrow(/同じカード/);
		expect(() => passTurn(state, 'p1')).toThrow(/場が空/);
		expect(() => playCards(state, 'p2', ['spades-6'])).toThrow(/番/);
	});

	it('rejects mismatched combinations and weaker plays', () => {
		const state = room({
			p1: [card(6), card(6, 'hearts')],
			p2: [card(7), card(8)],
			p3: [card(9), card(9, 'hearts')],
		});

		playCards(state, 'p1', ['spades-6', 'hearts-6']);

		expect(() => playCards(state, 'p2', ['spades-7'])).toThrow(/同じ種類/);
		expect(() => playCards(state, 'p2', ['spades-7', 'spades-8'])).toThrow(/同じ数字|階段/);
		state.turnPlayerId = 'p3';
		expect(() => playCards(state, 'p3', ['spades-9', 'hearts-9'])).not.toThrow();
	});
});

describe('special rule effects', () => {
	it('clears the pile with eight cut and gives the next lead to the player', () => {
		const state = room(
			{ p1: [card(8), card(4)], p2: [card(9)], p3: [card(10)] },
			{ forbiddenFinish: false },
		);

		playCards(state, 'p1', ['spades-8']);

		expect(state.pile).toBeUndefined();
		expect(state.turnPlayerId).toBe('p1');
	});

	it('records a player finishing with an eight cut before ending the game', () => {
		const state = room({ p1: [card(8)], p2: [card(9)] }, { forbiddenFinish: false });

		playCards(state, 'p1', ['spades-8']);

		expect(state.phase).toBe('finished');
		expect(state.winners).toEqual(['p1', 'p2']);
	});

	it('toggles revolution and requires weaker cards while inverted', () => {
		const state = room(
			{
				p1: [card(5), card(5, 'hearts'), card(5, 'clubs'), card(5, 'diamonds'), card(3)],
				p2: [card(4)],
				p3: [card(14)],
			},
			{ skip5: false },
		);

		playCards(state, 'p1', ['spades-5', 'hearts-5', 'clubs-5', 'diamonds-5']);
		passTurn(state, 'p2');
		passTurn(state, 'p3');
		playCards(state, 'p1', ['spades-3']);

		expect(state.revolution).toBe(true);
		expect(() => playCards({ ...state, turnPlayerId: 'p3' }, 'p3', ['spades-14'])).toThrow(/弱い/);
	});

	it('allows same-suit sequences when enabled', () => {
		const state = room({ p1: [card(5), card(6), card(7)], p2: [card(10)], p3: [card(11)] });

		expect(() => playCards(state, 'p1', ['spades-5', 'spades-6', 'spades-7'])).not.toThrow();
	});

	it('locks suits only when consecutive plays share suits', () => {
		const unlocked = room({ p1: [card(6)], p2: [card(7, 'hearts'), card(8)], p3: [card(9)] });
		playCards(unlocked, 'p1', ['spades-6']);
		playCards(unlocked, 'p2', ['hearts-7']);
		expect(unlocked.pile?.lockSuits).toEqual([]);

		const locked = room({
			p1: [card(6)],
			p2: [card(7, 'spades'), card(8, 'hearts')],
			p3: [card(9)],
		});
		playCards(locked, 'p1', ['spades-6']);
		playCards(locked, 'p2', ['spades-7']);

		expect(locked.pile?.lockSuits).toEqual(['spades']);
		expect(() => playCards(locked, 'p3', ['spades-9'])).not.toThrow();
	});

	it('applies eleven back until the pile clears', () => {
		const state = room({ p1: [card(11), card(4)], p2: [card(12), card(5)], p3: [card(6)] });

		playCards(state, 'p1', ['spades-11']);

		expect(state.jackBack).toBe(true);
		expect(() => playCards(state, 'p2', ['spades-12'])).toThrow(/弱い/);
	});

	it('skips the next player on fives', () => {
		const state = room(
			{ p1: [card(5), card(4)], p2: [card(6)], p3: [card(7)] },
			{ forbiddenFinish: false },
		);

		playCards(state, 'p1', ['spades-5']);

		expect(state.turnPlayerId).toBe('p3');
	});

	it('reverses turn direction on nines', () => {
		const state = room({ p1: [card(9), card(4)], p2: [card(10)], p3: [card(11)] });

		playCards(state, 'p1', ['spades-9']);

		expect(state.turnDirection).toBe(-1);
		expect(state.turnPlayerId).toBe('p3');
	});

	it('allows spade three to beat a single joker', () => {
		const state = room({ p1: [card(3), card(4)], p2: [card(5)] });
		state.pile = singleJokerPile();

		expect(() => playCards(state, 'p1', ['spades-3'])).not.toThrow();
	});

	it('blocks forbidden finishes when the rule is enabled', () => {
		const state = room({ p1: [card(8)], p2: [card(9)] });

		expect(() => playCards(state, 'p1', ['spades-8'])).toThrow(/反則/);
	});

	it('does not reset an active game', () => {
		const state = room({ p1: [card(4)], p2: [card(6)] });

		expect(() => resetRoom(state)).toThrow(/終了後/);
	});
});
