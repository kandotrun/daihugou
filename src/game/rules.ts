import type {
  Card,
  GameState,
  Pile,
  Player,
  PlayerInput,
  PublicState,
  Rank,
  Suit,
} from "./types";

const suits: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
const ranks: Rank[] = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
  "2",
];
const rankPower = new Map<Rank, number>(
  ranks.map((rank, index) => [rank, index + 1]),
);
rankPower.set("JOKER", 99);

export function createDeck(): Card[] {
  const cards = suits.flatMap((suit) =>
    ranks.map((rank) => ({ id: `${suit}-${rank}`, suit, rank })),
  );
  cards.push({ id: "joker-JOKER", suit: "joker", rank: "JOKER" });
  return cards;
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function compareCards(a: Card, b: Card): number {
  const byRank = (rankPower.get(a.rank) ?? 0) - (rankPower.get(b.rank) ?? 0);
  if (byRank !== 0) return byRank;
  return a.id.localeCompare(b.id);
}

export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort(compareCards);
}

export function dealCards(
  deck: Card[],
  playerIds: string[],
): Record<string, Card[]> {
  if (playerIds.length === 0) return {};
  const hands = Object.fromEntries(playerIds.map((id) => [id, [] as Card[]]));
  deck.forEach((card, index) => {
    hands[playerIds[index % playerIds.length]].push(card);
  });
  for (const id of playerIds) hands[id] = sortHand(hands[id]);
  return hands;
}

export function startGame(
  roomId: string,
  players: PlayerInput[],
  deck = shuffle(createDeck()),
): GameState {
  if (players.length < 2)
    throw new Error("At least two players are required to start");
  const hands = dealCards(
    deck,
    players.map((player) => player.id),
  );
  return {
    id: roomId,
    status: "playing",
    players: players.map((player) => ({
      ...player,
      hand: hands[player.id] ?? [],
      connected: true,
    })),
    currentTurnPlayerId: players[0].id,
    passes: [],
    winnerIds: [],
    log: ["ゲームを開始しました"],
  };
}

function getComboRank(cards: Card[]): Rank {
  const nonJokers = cards.filter((card) => card.rank !== "JOKER");
  if (nonJokers.length === 0) return "JOKER";
  const [rank] = nonJokers;
  if (nonJokers.some((card) => card.rank !== rank.rank)) {
    throw new Error(
      "Cards must be the same rank unless a joker is substituting",
    );
  }
  return rank.rank;
}

function comboPower(cards: Card[]): number {
  return rankPower.get(getComboRank(cards)) ?? 0;
}

export function isValidPlay(cards: Card[], pile?: Pile): boolean {
  if (cards.length === 0) return false;
  getComboRank(cards);
  if (!pile) return true;
  return (
    cards.length === pile.cards.length &&
    comboPower(cards) > comboPower(pile.cards)
  );
}

function nextActivePlayer(
  state: GameState,
  afterPlayerId: string,
): string | undefined {
  const activePlayers = state.players.filter(
    (player) => player.hand.length > 0,
  );
  if (activePlayers.length === 0) return undefined;
  const startIndex = state.players.findIndex(
    (player) => player.id === afterPlayerId,
  );
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const player =
      state.players[
        (startIndex + offset + state.players.length) % state.players.length
      ];
    if (player.hand.length > 0) return player.id;
  }
  return undefined;
}

export function playCards(
  state: GameState,
  playerId: string,
  cardIds: string[],
): GameState {
  if (state.status !== "playing") throw new Error("Game is not playing");
  if (state.currentTurnPlayerId !== playerId)
    throw new Error("It is not your turn");
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error("Player not found");
  const cards = cardIds.map((id) => {
    const card = player.hand.find((candidate) => candidate.id === id);
    if (!card) throw new Error(`Card not found in hand: ${id}`);
    return card;
  });
  if (!isValidPlay(cards, state.pile))
    throw new Error("Selected cards cannot beat the current pile");

  const remainingHand = player.hand.filter(
    (card) => !cardIds.includes(card.id),
  );
  const winnerIds =
    remainingHand.length === 0 && !state.winnerIds.includes(playerId)
      ? [...state.winnerIds, playerId]
      : state.winnerIds;
  const players = state.players.map((candidate) =>
    candidate.id === playerId
      ? { ...candidate, hand: remainingHand }
      : candidate,
  );
  const nextState: GameState = {
    ...state,
    players,
    pile: { cards, playedByPlayerId: playerId },
    lastPlayedByPlayerId: playerId,
    passes: [],
    winnerIds,
    log: [
      `${player.name} が ${cards.map(formatCard).join(" ")} を出しました`,
      ...state.log,
    ].slice(0, 40),
  };
  const unfinished = players.filter((candidate) => candidate.hand.length > 0);
  return {
    ...nextState,
    status: unfinished.length <= 1 ? "finished" : "playing",
    currentTurnPlayerId:
      unfinished.length <= 1
        ? undefined
        : nextActivePlayer(nextState, playerId),
  };
}

export function passTurn(state: GameState, playerId: string): GameState {
  if (state.status !== "playing") throw new Error("Game is not playing");
  if (state.currentTurnPlayerId !== playerId)
    throw new Error("It is not your turn");
  if (!state.pile) throw new Error("You cannot pass on an empty pile");
  const activeIds = state.players
    .filter((player) => player.hand.length > 0)
    .map((player) => player.id);
  const passes = Array.from(new Set([...state.passes, playerId]));
  const shouldClear = state.lastPlayedByPlayerId
    ? activeIds.every(
        (id) => id === state.lastPlayedByPlayerId || passes.includes(id),
      )
    : false;
  if (shouldClear && state.lastPlayedByPlayerId) {
    return {
      ...state,
      currentTurnPlayerId: state.lastPlayedByPlayerId,
      pile: undefined,
      passes: [],
      log: ["場が流れました", ...state.log].slice(0, 40),
    };
  }
  return {
    ...state,
    passes,
    currentTurnPlayerId: nextActivePlayer(state, playerId),
    log: [
      `${state.players.find((player) => player.id === playerId)?.name ?? "Player"} がパスしました`,
      ...state.log,
    ].slice(0, 40),
  };
}

export function playableCards(hand: Card[], pile?: Pile): Card[] {
  if (!pile || pile.cards.length !== 1) return hand;
  return hand.filter((card) => comboPower([card]) > comboPower(pile.cards));
}

export function toPublicState(
  state: GameState,
  playerId?: string,
): PublicState {
  return {
    ...state,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      handCount: player.hand.length,
      connected: player.connected,
      isFinished:
        state.winnerIds.includes(player.id) ||
        (state.status === "finished" && player.hand.length === 0),
    })),
    me: state.players.find((player) => player.id === playerId),
  };
}

export function formatCard(card: Card): string {
  if (card.rank === "JOKER") return "🃏";
  const suit = {
    clubs: "♣",
    diamonds: "♦",
    hearts: "♥",
    spades: "♠",
    joker: "",
  }[card.suit];
  return `${suit}${card.rank}`;
}

export function createLobby(roomId: string): GameState {
  return {
    id: roomId,
    status: "lobby",
    players: [],
    passes: [],
    winnerIds: [],
    log: ["ルームを作成しました"],
  };
}

export function upsertLobbyPlayer(
  state: GameState,
  player: Pick<Player, "id" | "name">,
): GameState {
  const existing = state.players.find(
    (candidate) => candidate.id === player.id,
  );
  const players = existing
    ? state.players.map((candidate) =>
        candidate.id === player.id
          ? { ...candidate, name: player.name, connected: true }
          : candidate,
      )
    : [...state.players, { ...player, hand: [], connected: true }];
  return {
    ...state,
    players,
    log: existing
      ? state.log
      : [`${player.name} が参加しました`, ...state.log].slice(0, 40),
  };
}

export function setPlayerConnected(
  state: GameState,
  playerId: string,
  connected: boolean,
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, connected } : player,
    ),
  };
}
