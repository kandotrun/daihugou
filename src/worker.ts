import {
  createLobby,
  passTurn,
  playCards,
  setPlayerConnected,
  startGame,
  toPublicState,
  upsertLobbyPlayer,
} from "./game/rules";
import type { ClientMessage, GameState, ServerMessage } from "./game/types";

export type Env = {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
};

type Session = {
  socket: WebSocket;
  playerId?: string;
};

export class DaihugouRoom {
  private state: DurableObjectState;
  private sessions = new Set<Session>();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/socket")) return this.handleSocket(request);
    const state = await this.loadState();
    return Response.json(toPublicState(state));
  }

  private async handleSocket(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket")
      return new Response("Expected websocket", { status: 426 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const session: Session = { socket: server };
    this.sessions.add(session);
    server.accept();

    server.addEventListener("message", (event) => {
      void this.onMessage(session, String(event.data));
    });
    server.addEventListener("close", () => {
      void this.onClose(session);
    });
    server.addEventListener("error", () => {
      void this.onClose(session);
    });

    this.send(session, {
      type: "state",
      state: toPublicState(
        awaitableFallback(await this.loadState()),
        session.playerId,
      ),
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  private async onMessage(session: Session, raw: string): Promise<void> {
    try {
      const message = JSON.parse(raw) as ClientMessage;
      let state = await this.loadState();
      if (message.type === "join") {
        const playerId = message.playerId || crypto.randomUUID();
        session.playerId = playerId;
        state = upsertLobbyPlayer(state, {
          id: playerId,
          name: message.name.slice(0, 24) || "Player",
        });
      } else {
        if (!session.playerId) throw new Error("Join first");
        if (message.type === "start") {
          state = startGame(
            state.id,
            state.players.map((player) => ({
              id: player.id,
              name: player.name,
            })),
          );
        }
        if (message.type === "play")
          state = playCards(state, session.playerId, message.cardIds);
        if (message.type === "pass") state = passTurn(state, session.playerId);
      }
      await this.saveState(state);
      this.broadcast(state);
    } catch (error) {
      this.send(session, {
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async onClose(session: Session): Promise<void> {
    this.sessions.delete(session);
    if (!session.playerId) return;
    const state = setPlayerConnected(
      await this.loadState(),
      session.playerId,
      false,
    );
    await this.saveState(state);
    this.broadcast(state);
  }

  private async loadState(): Promise<GameState> {
    const stored = await this.state.storage.get<GameState>("state");
    return stored ?? createLobby(this.state.id.toString());
  }

  private async saveState(state: GameState): Promise<void> {
    await this.state.storage.put("state", state);
  }

  private broadcast(state: GameState): void {
    for (const session of this.sessions)
      this.send(session, {
        type: "state",
        state: toPublicState(state, session.playerId),
      });
  }

  private send(session: Session, message: ServerMessage): void {
    try {
      session.socket.send(JSON.stringify(message));
    } catch {
      this.sessions.delete(session);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/socket)?$/);
    if (match) {
      const id = env.ROOMS.idFromName(match[1]);
      return env.ROOMS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

function awaitableFallback<T>(value: T): T {
  return value;
}
