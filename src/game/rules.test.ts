import { describe, expect, it } from "vitest";
import {
  createDeck,
  dealCards,
  playableCards,
  playCards,
  startGame,
} from "./rules";
import type { Card, GameState } from "./types";

const c = (rank: Card["rank"], suit: Card["suit"] = "spades"): Card => ({
  rank,
  suit,
  id: `${suit}-${rank}`,
});

describe("deck", () => {
  it("creates a 53-card deck with a joker", () => {
    const deck = createDeck();

    expect(deck).toHaveLength(53);
    expect(new Set(deck.map((card) => card.id)).size).toBe(53);
    expect(deck.some((card) => card.rank === "JOKER")).toBe(true);
  });
});

describe("dealCards", () => {
  it("deals every card as evenly as possible across many players", () => {
    const hands = dealCards(createDeck(), ["a", "b", "c", "d", "e", "f", "g"]);
    const counts = Object.values(hands).map((hand) => hand.length);

    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(53);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe("playCards", () => {
  it("allows a stronger pair over the current pair", () => {
    const state: GameState = {
      id: "r",
      status: "playing",
      players: [
        {
          id: "p1",
          name: "P1",
          hand: [c("5"), c("5", "hearts")],
          connected: true,
        },
        { id: "p2", name: "P2", hand: [], connected: true },
      ],
      currentTurnPlayerId: "p1",
      lastPlayedByPlayerId: "p2",
      pile: { cards: [c("4"), c("4", "diamonds")], playedByPlayerId: "p2" },
      passes: [],
      winnerIds: [],
      log: [],
    };

    const next = playCards(state, "p1", ["spades-5", "hearts-5"]);

    expect(next.pile?.cards.map((card) => card.rank)).toEqual(["5", "5"]);
    expect(next.winnerIds).toEqual(["p1"]);
  });

  it("rejects mixed-rank non-joker combinations", () => {
    const state = startGame(
      "r",
      [
        { id: "p1", name: "P1" },
        { id: "p2", name: "P2" },
      ],
      createDeck(),
    );
    const hand = state.players[0].hand
      .slice(0, 2)
      .map(
        (card, index) => ({ ...card, rank: index === 0 ? "3" : "4" }) as Card,
      );
    const patched = {
      ...state,
      players: [{ ...state.players[0], hand }, state.players[1]],
      currentTurnPlayerId: "p1",
    };

    expect(() =>
      playCards(
        patched,
        "p1",
        hand.map((card) => card.id),
      ),
    ).toThrow(/same rank/i);
  });
});

describe("playableCards", () => {
  it("returns only cards that can beat the current single", () => {
    const hand = [c("3"), c("10"), c("2"), c("JOKER", "joker")];

    expect(
      playableCards(hand, { cards: [c("9")], playedByPlayerId: "x" }).map(
        (card) => card.rank,
      ),
    ).toEqual(["10", "2", "JOKER"]);
  });
});
