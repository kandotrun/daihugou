import type { ClientCommand, PublicRoomState, ServerEvent } from './types';

const productionApiBase = 'https://daihugou-api.softbank.workers.dev';

export type RoomClient = {
	send(command: ClientCommand): void;
	close(): void;
};

export function apiBase() {
	if (typeof window === 'undefined') return '';
	return localStorage.getItem('daihugou-api-base') || defaultApiBase();
}

function defaultApiBase() {
	if (typeof window === 'undefined') return '';
	if (window.location.hostname === 'daihugou.pages.dev') return productionApiBase;
	if (window.location.hostname.endsWith('.daihugou.pages.dev')) return productionApiBase;
	return '';
}

export function setApiBase(value: string) {
	const normalized = value.trim().replace(/\/$/, '');
	if (normalized) localStorage.setItem('daihugou-api-base', normalized);
	else localStorage.removeItem('daihugou-api-base');
}

export async function createRoom() {
	const response = await fetch(`${apiBase()}/api/rooms`, { method: 'POST' });
	if (!response.ok) throw new Error('部屋を作成できませんでした');
	return (await response.json()) as { roomId: string };
}

export function connectRoom(args: {
	roomId: string;
	name: string;
	playerId?: string;
	token?: string;
	onState: (state: PublicRoomState) => void;
	onJoined: (playerId: string, token: string) => void;
	onError: (message: string) => void;
}): RoomClient {
	const base = apiBase();
	const httpBase = base || window.location.origin;
	const url = new URL(`${httpBase}/api/rooms/${args.roomId}/socket`);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	url.searchParams.set('name', args.name);
	if (args.playerId) url.searchParams.set('playerId', args.playerId);
	if (args.token) url.searchParams.set('token', args.token);
	const ws = new WebSocket(url);
	ws.addEventListener('message', (event) => {
		try {
			const message = parseServerEvent(event.data);
			if (message.type === 'state') args.onState(message.state);
			if (message.type === 'joined') args.onJoined(message.playerId, message.token);
			if (message.type === 'error') args.onError(message.message);
		} catch {
			args.onError('サーバーから不正なデータを受信しました');
		}
	});
	ws.addEventListener('error', () => args.onError('WebSocket接続でエラーが発生しました'));
	return {
		send(command) {
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(command));
		},
		close() {
			ws.close();
		},
	};
}

function parseServerEvent(data: string): ServerEvent {
	const parsed = JSON.parse(data) as unknown;
	if (!isServerEvent(parsed)) throw new Error('Invalid server event');
	return parsed;
}

function isServerEvent(value: unknown): value is ServerEvent {
	if (!isRecord(value) || typeof value.type !== 'string') return false;
	if (value.type === 'error') return typeof value.message === 'string';
	if (value.type === 'joined') {
		return (
			typeof value.playerId === 'string' &&
			typeof value.token === 'string' &&
			typeof value.roomId === 'string'
		);
	}
	return value.type === 'state' && isRecord(value.state);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
