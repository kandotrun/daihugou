import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiBase, connectRoom, createRoom, setApiBase } from './client';

function storage() {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		clear() {
			values.clear();
		},
		getItem(key: string) {
			return values.get(key) ?? null;
		},
		key(index: number) {
			return [...values.keys()][index] ?? null;
		},
		removeItem(key: string) {
			values.delete(key);
		},
		setItem(key: string, value: string) {
			values.set(key, value);
		},
	} satisfies Storage;
}

function stubBrowser(hostname: string, origin = `https://${hostname}`) {
	vi.stubGlobal('window', { location: { hostname, origin } });
	vi.stubGlobal('localStorage', storage());
}

describe('apiBase', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('uses the deployed Worker by default on the production Pages host', () => {
		stubBrowser('daihugou.pages.dev');

		expect(apiBase()).toBe('https://daihugou-api.softbank.workers.dev');
	});

	it('uses the deployed Worker by default on preview Pages hosts', () => {
		stubBrowser('5df5ad00.daihugou.pages.dev');

		expect(apiBase()).toBe('https://daihugou-api.softbank.workers.dev');
	});

	it('stores normalized API overrides and clears them for an empty value', () => {
		stubBrowser('localhost', 'http://localhost:5173');

		setApiBase(' http://127.0.0.1:8787/ ');
		expect(apiBase()).toBe('http://127.0.0.1:8787');

		setApiBase('');
		expect(apiBase()).toBe('');
	});

	it('creates rooms against the active API base and reports failed responses', async () => {
		stubBrowser('localhost', 'http://localhost:5173');
		setApiBase('https://api.example.test');
		const calls: { input: string; method?: string }[] = [];
		vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
			calls.push({ input: String(input), method: init?.method });
			return Response.json({ roomId: 'room-1234' });
		});

		await expect(createRoom()).resolves.toEqual({ roomId: 'room-1234' });
		expect(calls).toEqual([{ input: 'https://api.example.test/api/rooms', method: 'POST' }]);

		vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }));
		await expect(createRoom()).rejects.toThrow(/作成/);
	});

	it('connects with a wss room URL, emits the player id, and sends only while open', () => {
		stubBrowser('daihugou.pages.dev');
		const sockets: TestWebSocket[] = [];
		vi.stubGlobal(
			'WebSocket',
			class extends TestWebSocket {
				constructor(url: string | URL) {
					super(url);
					sockets.push(this);
				}
			},
		);
		const states: string[] = [];
		const joined: string[] = [];
		const errors: string[] = [];

		const client = connectRoom({
			roomId: 'AbC123',
			name: 'Kan',
			playerId: 'returning',
			token: 'secret-token',
			onState(next) {
				states.push(next.id);
			},
			onJoined(nextPlayerId, nextToken) {
				joined.push(`${nextPlayerId}:${nextToken}`);
			},
			onError(message) {
				errors.push(message);
			},
		});

		expect(sockets).toHaveLength(1);
		expect(sockets[0].url).toBe(
			'wss://daihugou-api.softbank.workers.dev/api/rooms/AbC123/socket?name=Kan&playerId=returning&token=secret-token',
		);

		sockets[0].emitMessage({
			type: 'joined',
			playerId: 'new-id',
			token: 'new-token',
			roomId: 'AbC123',
		});
		sockets[0].emitMessage({
			type: 'state',
			state: {
				id: 'AbC123',
				phase: 'lobby',
				players: [],
				passes: [],
				winners: [],
				revolution: false,
				jackBack: false,
				turnDirection: 1,
				decks: 1,
				rules: {
					sequence: true,
					suitLock: true,
					eightCut: true,
					revolution: true,
					elevenBack: true,
					spade3BeatsJoker: true,
					forbiddenFinish: true,
					skip5: true,
					reverse9: true,
				},
				log: [],
				createdAt: 1,
				updatedAt: 1,
				handCounts: {},
			},
		});
		sockets[0].emitMessage({ type: 'error', message: 'bad move' });
		sockets[0].emitRaw('not json');
		client.send({ type: 'start' });
		sockets[0].readyState = TestWebSocket.CLOSED;
		client.send({ type: 'pass' });

		expect(joined).toEqual(['new-id:new-token']);
		expect(states).toEqual(['AbC123']);
		expect(errors).toEqual(['bad move', 'サーバーから不正なデータを受信しました']);
		expect(sockets[0].sent).toEqual([JSON.stringify({ type: 'start' })]);
		client.close();
		expect(sockets[0].readyState).toBe(TestWebSocket.CLOSED);
	});
});

class TestWebSocket {
	static readonly OPEN = 1;
	static readonly CLOSED = 3;
	readyState = TestWebSocket.OPEN;
	readonly sent: string[] = [];
	readonly url: string;
	private readonly listeners = new Map<string, ((event: MessageEvent<string> | Event) => void)[]>();

	constructor(url: string | URL) {
		this.url = String(url);
	}

	addEventListener(type: string, listener: (event: MessageEvent<string> | Event) => void) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	send(data: string) {
		this.sent.push(data);
	}

	close() {
		this.readyState = TestWebSocket.CLOSED;
	}

	emitMessage(data: unknown) {
		this.emitRaw(JSON.stringify(data));
	}

	emitRaw(data: string) {
		const event = { data } as MessageEvent<string>;
		for (const listener of this.listeners.get('message') ?? []) listener(event);
	}
}
