import { describe, expect, it } from 'vitest';
import {
	createRoom,
	defaultRules,
	joinRoom,
	passTurn,
	playCards,
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
		players: ids.map((id) => ({ id, name: id, connected: true, joinedAt: 1 })),
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

describe('room setup and public state', () => {
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
		expect(publicState.handCounts).toEqual({ p1: 2, p2: 2 });
		expect(publicState.me?.hand.map((ownedCard) => ownedCard.id)).toEqual(['spades-3', 'spades-4']);
		expect(JSON.stringify(publicState)).not.toContain('spades-10');
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
});
