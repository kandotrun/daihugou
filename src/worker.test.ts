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
		put(key: string, value: string, options?: KVNamespacePutOptions) {
			kvPuts.push({ key, value, options });
			return Promise.resolve();
		},
	} as unknown as KVNamespace;
	return { bindings: { ROOMS: rooms, ROOM_INDEX: kv }, durableRequests, idNames, kvPuts };
}

describe('worker routes', () => {
	it('serves health and CORS preflight without bindings', async () => {
		const health = await app.request('/health');
		await expect(health.json()).resolves.toEqual({ ok: true, service: 'daihugou-api' });

		const options = await app.request('/api/rooms', { method: 'OPTIONS' });
		expect(options.status).toBe(204);
		expect(options.headers.get('access-control-allow-origin')).toBe('*');
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
		const stateResponse = await app.request('/api/rooms/room-a/state', {}, stateEnv.bindings);

		expect(stateResponse.status).toBe(200);
		expect(stateEnv.idNames).toEqual(['room-a']);
		expect(stateEnv.durableRequests[0].headers.get('x-room-id')).toBe('room-a');
		expect(new URL(stateEnv.durableRequests[0].url).pathname).toBe('/state');

		const socketEnv = env();
		await app.request('/api/rooms/room-b/socket', {}, socketEnv.bindings);

		expect(socketEnv.idNames).toEqual(['room-b']);
		expect(new URL(socketEnv.durableRequests[0].url).pathname).toBe('/api/rooms/room-b/socket');
	});

	it('returns JSON for unknown routes', async () => {
		const response = await app.request('/missing');

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({ error: 'Not found' });
	});
});
