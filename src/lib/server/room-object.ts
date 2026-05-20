/// <reference types="@cloudflare/workers-types" />

import {
	createRoom,
	joinRoom,
	markDisconnected,
	passTurn,
	playCards,
	resetRoom,
	startGame,
	toPublicState,
	updateRules,
} from '../game/engine';
import type { ClientCommand, RoomState, RuleSettings, ServerEvent } from '../game/types';

type Connection = {
	ws: WebSocket;
	playerId?: string;
};

export class DaihugouRoom implements DurableObject {
	private state?: RoomState;
	private readonly connections = new Set<Connection>();

	constructor(
		private readonly durableState: DurableObjectState,
		readonly _env: unknown,
	) {}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const state = await this.getState(this.roomIdFromRequest(request, url));
		if (url.pathname.endsWith('/state')) return Response.json(toPublicState(state));
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected WebSocket', { status: 426 });
		}
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.accept(server, url);
		return new Response(null, { status: 101, webSocket: client });
	}

	private accept(ws: WebSocket, url: URL) {
		ws.accept();
		const connection: Connection = { ws };
		this.connections.add(connection);
		const name = url.searchParams.get('name');
		const playerId = url.searchParams.get('playerId') ?? undefined;
		const token = url.searchParams.get('token') ?? undefined;
		if (name) void this.handle(connection, { type: 'join', name, playerId, token });
		else void this.sendCurrentState(connection);
		ws.addEventListener('message', (event) => {
			try {
				void this.handle(connection, parseClientCommand(String(event.data)));
			} catch (error) {
				this.send(connection, {
					type: 'error',
					message: error instanceof Error ? error.message : 'コマンドを処理できませんでした',
				});
			}
		});
		ws.addEventListener('close', () => this.close(connection));
		ws.addEventListener('error', () => this.close(connection));
	}

	private async handle(connection: Connection, command: ClientCommand) {
		const state = await this.getState();
		try {
			switch (command.type) {
				case 'join': {
					const player = joinRoom(state, command.name, {
						playerId: command.playerId,
						token: command.token,
					});
					connection.playerId = player.id;
					this.send(connection, {
						type: 'joined',
						playerId: player.id,
						token: player.token,
						roomId: state.id,
					});
					break;
				}
				case 'start': {
					this.assertHost(state, this.requirePlayer(connection));
					startGame(state);
					break;
				}
				case 'play':
					if (!connection.playerId) throw new Error('先に参加してください');
					playCards(state, connection.playerId, command.cardIds);
					break;
				case 'pass':
					if (!connection.playerId) throw new Error('先に参加してください');
					passTurn(state, connection.playerId);
					break;
				case 'reset': {
					this.assertHost(state, this.requirePlayer(connection));
					resetRoom(state);
					break;
				}
				case 'updateRules':
					this.assertHost(state, this.requirePlayer(connection));
					updateRules(state, command.rules);
					break;
			}
			await this.persist();
			this.broadcast();
		} catch (error) {
			this.send(connection, {
				type: 'error',
				message: error instanceof Error ? error.message : 'エラーが発生しました',
			});
		}
	}

	private async close(connection: Connection) {
		this.connections.delete(connection);
		const state = await this.getState();
		if (
			connection.playerId &&
			![...this.connections].some((other) => other.playerId === connection.playerId)
		) {
			markDisconnected(state, connection.playerId);
			await this.persist();
			this.broadcast();
		}
	}

	private async broadcast() {
		const state = await this.getState();
		for (const connection of this.connections) {
			this.send(connection, { type: 'state', state: toPublicState(state, connection.playerId) });
		}
	}

	private async sendCurrentState(connection: Connection) {
		const state = await this.getState();
		this.send(connection, { type: 'state', state: toPublicState(state, connection.playerId) });
	}

	private send(connection: Connection, event: ServerEvent) {
		try {
			connection.ws.send(JSON.stringify(event));
		} catch {
			this.connections.delete(connection);
		}
	}

	private async getState(roomId?: string) {
		if (!this.state) {
			this.state =
				(await this.durableState.storage.get<RoomState>('room')) ??
				createRoom(roomId ?? this.durableState.id.toString().slice(0, 8));
		}
		return this.state;
	}

	private roomIdFromRequest(request: Request, url: URL) {
		const header = request.headers.get('x-room-id');
		if (header) return header;
		return url.pathname.match(/\/api\/rooms\/([^/]+)/)?.[1];
	}

	private async persist() {
		const state = await this.getState();
		await this.durableState.storage.put('room', state);
	}

	private requirePlayer(connection: Connection) {
		if (!connection.playerId) throw new Error('先に参加してください');
		return connection.playerId;
	}

	private assertHost(state: RoomState, playerId: string) {
		if (!state.players.find((player) => player.id === playerId)?.host) {
			throw new Error('ホストのみ操作できます');
		}
	}
}

const ruleKeys = [
	'sequence',
	'suitLock',
	'eightCut',
	'revolution',
	'elevenBack',
	'spade3BeatsJoker',
	'forbiddenFinish',
	'skip5',
	'reverse9',
] satisfies (keyof RuleSettings)[];

function parseClientCommand(data: string): ClientCommand {
	const parsed = JSON.parse(data) as unknown;
	if (!isClientCommand(parsed)) throw new Error('不正なコマンドです');
	return parsed;
}

function isClientCommand(value: unknown): value is ClientCommand {
	if (!isRecord(value) || typeof value.type !== 'string') return false;
	switch (value.type) {
		case 'join':
			return (
				typeof value.name === 'string' &&
				(value.playerId === undefined || typeof value.playerId === 'string') &&
				(value.token === undefined || typeof value.token === 'string')
			);
		case 'start':
		case 'pass':
		case 'reset':
			return true;
		case 'play':
			return Array.isArray(value.cardIds) && value.cardIds.every((id) => typeof id === 'string');
		case 'updateRules':
			return isRulePatch(value.rules);
		default:
			return false;
	}
}

function isRulePatch(value: unknown): value is Partial<RuleSettings> {
	if (!isRecord(value)) return false;
	return Object.entries(value).every(
		([key, checked]) =>
			ruleKeys.includes(key as keyof RuleSettings) && typeof checked === 'boolean',
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
