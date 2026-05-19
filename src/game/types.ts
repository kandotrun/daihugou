export type Suit = "clubs" | "diamonds" | "hearts" | "spades" | "joker";
export type Rank =
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A"
  | "2"
  | "JOKER";

export type Card = {
  id: string;
  suit: Suit;
  rank: Rank;
};

export type PublicPlayer = {
  id: string;
  name: string;
  handCount: number;
  connected: boolean;
  isFinished: boolean;
};

export type Player = {
  id: string;
  name: string;
  hand: Card[];
  connected: boolean;
};

export type Pile = {
  cards: Card[];
  playedByPlayerId: string;
};

export type GameStatus = "lobby" | "playing" | "finished";

export type GameState = {
  id: string;
  status: GameStatus;
  players: Player[];
  currentTurnPlayerId?: string;
  lastPlayedByPlayerId?: string;
  pile?: Pile;
  passes: string[];
  winnerIds: string[];
  log: string[];
};

export type PlayerInput = {
  id: string;
  name: string;
};

export type ClientMessage =
  | { type: "join"; playerId?: string; name: string }
  | { type: "start" }
  | { type: "play"; cardIds: string[] }
  | { type: "pass" };

export type PublicState = Omit<GameState, "players"> & {
  players: PublicPlayer[];
  me?: Player;
};

export type ServerMessage =
  | { type: "state"; state: PublicState }
  | { type: "error"; message: string };
