import { nanoid } from 'nanoid';
import type { Card, Rank, Suit } from './types';

export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS: Rank[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const JOKER_RANK = 16;

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

export function cardLabel(card: Card) {
	return card.suit === 'joker' ? 'Joker' : `${suitMarks[card.suit]}${RANK_LABELS[card.rank]}`;
}

export function sortHand(cards: Card[]) {
	return [...cards].sort(
		(a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit) || a.deck - b.deck,
	);
}

export function createDeck(decks: number): Card[] {
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

export function shuffle<T>(items: T[]): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}
