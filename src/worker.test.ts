import { describe, expect, it } from 'vitest';
import app from './worker';

type KvPutCall = {
	key: string;
	value: string;
	options?: KVNamespacePutOptions;
};

function env() {
	const durableRequests: Request[] = [];
	const idNames: string[] = [];
	const kvPuts: KvPutCall[] = [];
	const kvValues = new Map<string, string>();
	const durableId = { toString: () => 'durable-id' } as DurableObjectId;
	const stub = {
		fetch(input: RequestInfo | URL, init?: RequestInit) {
			const request = input instanceof Request ? input : new Request(input, init);
			durableRequests.push(request);
			return Response.json({ ok: true, path: new URL(request.url).pathname });
		},
	} as unknown as DurableObjectStub;
	const rooms = {
		idFromName(name: string) {
			idNames.push(name);
			return durableId;
		},
		get(id: DurableObjectId) {
			expect(id).toBe(durableId);
			return stub;
		},
	} as unknown as DurableObjectNamespace;
	const kv = {
		get(key: string) {
			return Promise.resolve(kvValues.get(key) ?? null);
		},
		put(key: string, value: string, options?: KVNamespacePutOptions) {
			kvPuts.push({ key, value, options });
			kvValues.set(key, value);
			return Promise.resolve();
		},
	} as unknown as KVNamespace;
	return { bindings: { ROOMS: rooms, ROOM_INDEX: kv }, durableRequests, idNames, kvPuts, kvValues };
}

describe('worker routes', () => {
	it('serves health and CORS preflight without bindings', async () => {
		const health = await app.request('/health');
		await expect(health.json()).resolves.toEqual({ ok: true, service: 'daihugou-api' });

		const options = await app.request('/api/rooms', {
			method: 'OPTIONS',
			headers: { Origin: 'https://daihugou.pages.dev' },
		});
		expect(options.status).toBe(204);
		expect(options.headers.get('access-control-allow-origin')).toBe('https://daihugou.pages.dev');

		const blocked = await app.request('/api/rooms', {
			method: 'OPTIONS',
			headers: { Origin: 'https://example.com' },
		});
		expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
	});

	it('creates a room through Durable Objects and indexes it in KV', async () => {
		const testEnv = env();
		const response = await app.request('/api/rooms', { method: 'POST' }, testEnv.bindings);
		const body = (await response.json()) as { roomId: string };

		expect(response.status).toBe(200);
		expect(body.roomId).toMatch(/^[a-z0-9_-]{8}$/);
		expect(testEnv.idNames).toEqual([body.roomId]);
		expect(testEnv.durableRequests).toHaveLength(1);
		expect(testEnv.durableRequests[0].headers.get('x-room-id')).toBe(body.roomId);
		expect(testEnv.kvPuts).toHaveLength(1);
		expect(testEnv.kvPuts[0].key).toBe(body.roomId);
		expect(JSON.parse(testEnv.kvPuts[0].value)).toMatchObject({ roomId: body.roomId });
		expect(testEnv.kvPuts[0].options).toEqual({ expirationTtl: 60 * 60 * 24 });
	});

	it('forwards state and socket requests to the room Durable Object', async () => {
		const stateEnv = env();
		stateEnv.kvValues.set('rooma123', JSON.stringify({ roomId: 'rooma123' }));
		const stateResponse = await app.request('/api/rooms/rooma123/state', {}, stateEnv.bindings);

		expect(stateResponse.status).toBe(200);
		expect(stateEnv.idNames).toEqual(['rooma123']);
		expect(stateEnv.durableRequests[0].headers.get('x-room-id')).toBe('rooma123');
		expect(new URL(stateEnv.durableRequests[0].url).pathname).toBe('/state');

		const socketEnv = env();
		socketEnv.kvValues.set('roomb123', JSON.stringify({ roomId: 'roomb123' }));
		await app.request(
			'/api/rooms/roomb123/socket',
			{ headers: { Origin: 'https://daihugou.pages.dev' } },
			socketEnv.bindings,
		);

		expect(socketEnv.idNames).toEqual(['roomb123']);
		expect(new URL(socketEnv.durableRequests[0].url).pathname).toBe('/api/rooms/roomb123/socket');
	});

	it('rejects invalid, unknown, and disallowed room access', async () => {
		const invalidEnv = env();
		const invalid = await app.request('/api/rooms/not-valid-room/state', {}, invalidEnv.bindings);
		expect(invalid.status).toBe(400);
		await expect(invalid.json()).resolves.toEqual({ error: 'Invalid room id' });

		const unknownEnv = env();
		const unknown = await app.request('/api/rooms/rooma123/state', {}, unknownEnv.bindings);
		expect(unknown.status).toBe(404);
		await expect(unknown.json()).resolves.toEqual({ error: 'Room not found' });

		const originEnv = env();
		originEnv.kvValues.set('roomb123', JSON.stringify({ roomId: 'roomb123' }));
		const blocked = await app.request(
			'/api/rooms/roomb123/socket',
			{ headers: { Origin: 'https://example.com' } },
			originEnv.bindings,
		);
		expect(blocked.status).toBe(403);
		await expect(blocked.json()).resolves.toEqual({ error: 'Origin not allowed' });
	});

	it('returns JSON for unknown routes', async () => {
		const response = await app.request('/missing');

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({ error: 'Not found' });
	});
});
