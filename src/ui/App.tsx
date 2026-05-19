import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { formatCard } from "../game/rules";
import type { Card, PublicState, ServerMessage } from "../game/types";

const PLAYER_ID_KEY = "daihugou.playerId";
const PLAYER_NAME_KEY = "daihugou.playerName";

export function App() {
  const params = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState(
    () => localStorage.getItem(PLAYER_NAME_KEY) || "",
  );
  const [state, setState] = useState<PublicState | null>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const roomId = params.roomId;

  const connect = useCallback((targetRoomId: string, playerName: string) => {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${protocol}://${location.host}/api/rooms/${targetRoomId}/socket`,
    );
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          type: "join",
          playerId: localStorage.getItem(PLAYER_ID_KEY) || undefined,
          name: playerName,
        }),
      );
    });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === "error") setError(message.message);
      if (message.type === "state") {
        setState(message.state);
        if (message.state.me)
          localStorage.setItem(PLAYER_ID_KEY, message.state.me.id);
      }
    });
    ws.addEventListener("close", () =>
      setError("接続が切れました。再読み込みしてください。"),
    );
    setSocket(ws);
    return ws;
  }, []);

  useEffect(() => {
    if (!roomId || !name) return;
    const ws = connect(roomId, name);
    return () => ws.close();
  }, [connect, name, roomId]);

  const submitLobby = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextName = String(form.get("name") || "Player").trim();
    const nextRoomId = String(
      form.get("room") || crypto.randomUUID().slice(0, 8),
    ).trim();
    localStorage.setItem(PLAYER_NAME_KEY, nextName);
    setName(nextName);
    navigate(`/rooms/${encodeURIComponent(nextRoomId)}`);
  };

  const send = (payload: unknown) => {
    setError(null);
    socket?.send(JSON.stringify(payload));
  };

  const selectedCards = useMemo(
    () => state?.me?.hand.filter((card) => selectedIds.includes(card.id)) ?? [],
    [selectedIds, state?.me?.hand],
  );

  if (!roomId || !name) {
    return (
      <main className="shell hero">
        <section className="panel intro">
          <p className="eyebrow">Cloudflare Workers × Durable Objects</p>
          <h1>大人数で遊べる大富豪</h1>
          <p>
            アプリ不要。URL を共有してブラウザから同じルームに参加できます。
          </p>
          <form onSubmit={submitLobby} className="join-form">
            <label>
              名前
              <input
                name="name"
                defaultValue={name}
                placeholder="Kan"
                maxLength={24}
                required
              />
            </label>
            <label>
              ルームID
              <input name="room" placeholder="未入力なら自動生成" />
            </label>
            <button type="submit">ルームに入る</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Room / {roomId}</p>
          <h1>大富豪</h1>
        </div>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(location.href)}
        >
          招待 URL をコピー
        </button>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="grid">
        <aside className="panel players">
          <h2>参加者 {state?.players.length ?? 0}</h2>
          {state?.players.map((player) => (
            <div
              className={
                player.id === state.currentTurnPlayerId
                  ? "player active"
                  : "player"
              }
              key={player.id}
            >
              <span>{player.name}</span>
              <small>
                {player.isFinished ? "上がり" : `${player.handCount} 枚`}{" "}
                {player.connected ? "●" : "○"}
              </small>
            </div>
          ))}
          {state?.status === "lobby" && (
            <button type="button" onClick={() => send({ type: "start" })}>
              開始
            </button>
          )}
        </aside>

        <section className="panel table">
          <h2>
            {state?.status === "lobby"
              ? "ロビー"
              : state?.status === "finished"
                ? "終了"
                : "プレイ中"}
          </h2>
          <div className="pile">
            {state?.pile?.cards.length ? (
              state.pile.cards.map((card) => (
                <CardView card={card} key={card.id} />
              ))
            ) : (
              <span>場は空です</span>
            )}
          </div>
          <div className="actions">
            <button
              type="button"
              disabled={
                !selectedIds.length ||
                state?.currentTurnPlayerId !== state?.me?.id
              }
              onClick={() => {
                send({ type: "play", cardIds: selectedIds });
                setSelectedIds([]);
              }}
            >
              出す{" "}
              {selectedCards.length
                ? `(${selectedCards.map(formatCard).join(" ")})`
                : ""}
            </button>
            <button
              type="button"
              disabled={
                !state?.pile || state?.currentTurnPlayerId !== state?.me?.id
              }
              onClick={() => send({ type: "pass" })}
            >
              パス
            </button>
          </div>
          <details>
            <summary>ログ</summary>
            <ol>
              {state?.log.map((entry, index) => (
                <li key={`${entry}-${index}`}>{entry}</li>
              ))}
            </ol>
          </details>
        </section>
      </section>

      <section className="panel hand-panel">
        <h2>手札 {state?.me?.hand.length ?? 0} 枚</h2>
        <div className="hand">
          {state?.me?.hand.map((card) => (
            <button
              type="button"
              className={
                selectedIds.includes(card.id) ? "card selected" : "card"
              }
              key={card.id}
              onClick={() =>
                setSelectedIds((ids) =>
                  ids.includes(card.id)
                    ? ids.filter((id) => id !== card.id)
                    : [...ids, card.id],
                )
              }
            >
              {formatCard(card)}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function CardView({ card }: { card: Card }) {
  return <span className="card readonly">{formatCard(card)}</span>;
}
