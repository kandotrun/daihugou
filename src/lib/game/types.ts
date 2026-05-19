export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs' | 'joker';

export type Rank = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

export type Card = {
	id: string;
	suit: Suit;
	rank: Rank;
	label: string;
	deck: number;
};

export type Player = {
	id: string;
	name: string;
	connected: boolean;
	joinedAt: number;
	finishedAt?: number;
};

export type Pile = {
	cards: Card[];
	playerId: string;
	playedAt: number;
};

export type GamePhase = 'lobby' | 'playing' | 'finished';

export type RoomState = {
	id: string;
	phase: GamePhase;
	players: Player[];
	hands: Record<string, Card[]>;
	turnPlayerId?: string;
	pile?: Pile;
	passes: string[];
	winners: string[];
	revolution: boolean;
	decks: number;
	log: GameLogEntry[];
	createdAt: number;
	updatedAt: number;
};

export type GameLogEntry = {
	id: string;
	message: string;
	at: number;
};

export type PublicRoomState = Omit<RoomState, 'hands'> & {
	handCounts: Record<string, number>;
	me?: {
		playerId: string;
		hand: Card[];
	};
};

export type ClientCommand =
	| { type: 'join'; name: string; playerId?: string }
	| { type: 'start' }
	| { type: 'play'; cardIds: string[] }
	| { type: 'pass' }
	| { type: 'reset' };

export type ServerEvent =
	| { type: 'state'; state: PublicRoomState }
	| { type: 'joined'; playerId: string; roomId: string }
	| { type: 'error'; message: string };
