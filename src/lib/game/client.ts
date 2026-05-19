import type { ClientCommand, PublicRoomState, ServerEvent } from './types';

export type RoomClient = {
	send(command: ClientCommand): void;
	close(): void;
};

export function apiBase() {
	if (typeof window === 'undefined') return '';
	return localStorage.getItem('daihugou-api-base') || '';
}

export function setApiBase(value: string) {
	localStorage.setItem('daihugou-api-base', value.replace(/\/$/, ''));
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
	onState: (state: PublicRoomState) => void;
	onJoined: (playerId: string) => void;
	onError: (message: string) => void;
}): RoomClient {
	const base = apiBase();
	const httpBase = base || window.location.origin;
	const url = new URL(`${httpBase}/api/rooms/${args.roomId}/socket`);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	url.searchParams.set('name', args.name);
	if (args.playerId) url.searchParams.set('playerId', args.playerId);
	const ws = new WebSocket(url);
	ws.addEventListener('message', (event) => {
		const message = JSON.parse(event.data) as ServerEvent;
		if (message.type === 'state') args.onState(message.state);
		if (message.type === 'joined') args.onJoined(message.playerId);
		if (message.type === 'error') args.onError(message.message);
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
