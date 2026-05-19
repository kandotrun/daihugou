import { describe, expect, it } from 'vitest';
import { createRoom, defaultRules, joinRoom, passTurn, playCards, updateRules } from './engine';
import type { Card, Rank, RoomState, RuleSettings, Suit } from './types';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({
	id: `${suit}-${rank}`,
	suit,
	rank,
	label: String(rank),
	deck: 1,
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

describe('configurable Daifugō rules', () => {
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

	it('applies eight cut, revolution, sequence, suit lock, eleven back, skip, reverse, spade three, and forbidden finish', () => {
		const eight = room(
			{ p1: [card(8), card(4)], p2: [card(9)], p3: [card(10)] },
			{ forbiddenFinish: false },
		);
		playCards(eight, 'p1', ['spades-8']);
		expect(eight.pile).toBeUndefined();
		expect(eight.turnPlayerId).toBe('p1');

		const rev = room(
			{
				p1: [card(5), card(5, 'hearts'), card(5, 'clubs'), card(5, 'diamonds'), card(3)],
				p2: [card(4)],
				p3: [card(14)],
			},
			{ skip5: false },
		);
		playCards(rev, 'p1', ['spades-5', 'hearts-5', 'clubs-5', 'diamonds-5']);
		expect(rev.revolution).toBe(true);
		passTurn(rev, 'p2');
		passTurn(rev, 'p3');
		playCards(rev, 'p1', ['spades-3']);
		expect(() => playCards({ ...rev, turnPlayerId: 'p3' }, 'p3', ['spades-14'])).toThrow(/弱い/);

		const sequence = room({ p1: [card(5), card(6), card(7)], p2: [card(10)], p3: [card(11)] });
		expect(() => playCards(sequence, 'p1', ['spades-5', 'spades-6', 'spades-7'])).not.toThrow();

		const lock = room({ p1: [card(6)], p2: [card(7, 'hearts'), card(8)], p3: [card(9)] });
		playCards(lock, 'p1', ['spades-6']);
		playCards(lock, 'p2', ['hearts-7']);
		expect(lock.pile?.lockSuits).toEqual([]);
		const locked = room({
			p1: [card(6)],
			p2: [card(7, 'spades'), card(8, 'hearts')],
			p3: [card(9)],
		});
		playCards(locked, 'p1', ['spades-6']);
		playCards(locked, 'p2', ['spades-7']);
		expect(locked.pile?.lockSuits).toEqual(['spades']);
		expect(() => playCards(locked, 'p3', ['spades-9'])).not.toThrow();

		const eleven = room({ p1: [card(11), card(4)], p2: [card(12), card(5)], p3: [card(6)] });
		playCards(eleven, 'p1', ['spades-11']);
		expect(eleven.jackBack).toBe(true);
		expect(() => playCards(eleven, 'p2', ['spades-12'])).toThrow(/弱い/);

		const skip = room(
			{ p1: [card(5), card(4)], p2: [card(6)], p3: [card(7)] },
			{ forbiddenFinish: false },
		);
		playCards(skip, 'p1', ['spades-5']);
		expect(skip.turnPlayerId).toBe('p3');

		const reverse = room({ p1: [card(9), card(4)], p2: [card(10)], p3: [card(11)] });
		playCards(reverse, 'p1', ['spades-9']);
		expect(reverse.turnDirection).toBe(-1);
		expect(reverse.turnPlayerId).toBe('p3');

		const spadeThree = room({ p1: [card(3), card(4)], p2: [card(5)] });
		spadeThree.pile = {
			cards: [card(16, 'joker')],
			playerId: 'p2',
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
		};
		expect(() => playCards(spadeThree, 'p1', ['spades-3'])).not.toThrow();

		const forbidden = room({ p1: [card(8)], p2: [card(9)] });
		expect(() => playCards(forbidden, 'p1', ['spades-8'])).toThrow(/反則/);
	});
});
