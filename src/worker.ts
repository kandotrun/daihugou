import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { DaihugouRoom } from './lib/server/room-object';

export { DaihugouRoom };

type Env = {
	ROOMS: DurableObjectNamespace;
	ROOM_INDEX?: KVNamespace;
};

const app = new Hono<{ Bindings: Env }>();
const roomIdPattern = /^[a-z0-9_-]{8}$/;

app.use('*', async (c, next) => {
	const origin = allowedOrigin(c.req.header('Origin'));
	if (c.req.method === 'OPTIONS') {
		const response = new Response(null, { status: 204 });
		applyCorsHeaders(response.headers, origin);
		return response;
	}
	await next();
	applyCorsHeaders(c.res.headers, origin);
});

app.get('/health', (c) => c.json({ ok: true, service: 'daihugou-api' }));

app.post('/api/rooms', async (c) => {
	const roomId = await createRoomId(c.env.ROOM_INDEX);
	const id = c.env.ROOMS.idFromName(roomId);
	const stub = c.env.ROOMS.get(id);
	await stub.fetch(new Request('https://room.local/state', { headers: { 'x-room-id': roomId } }));
	await c.env.ROOM_INDEX?.put(roomId, JSON.stringify({ roomId, createdAt: Date.now() }), {
		expirationTtl: 60 * 60 * 24,
	});
	return c.json({ roomId });
});

app.get('/api/rooms/:roomId/state', async (c) => {
	const roomId = c.req.param('roomId');
	if (!roomIdPattern.test(roomId)) return c.json({ error: 'Invalid room id' }, 400);
	if (await isUnknownRoom(c.env.ROOM_INDEX, roomId))
		return c.json({ error: 'Room not found' }, 404);
	const id = c.env.ROOMS.idFromName(roomId);
	return c.env.ROOMS.get(id).fetch(
		new Request('https://room.local/state', { headers: { 'x-room-id': roomId } }),
	);
});

app.get('/api/rooms/:roomId/socket', async (c) => {
	const roomId = c.req.param('roomId');
	if (!roomIdPattern.test(roomId)) return c.json({ error: 'Invalid room id' }, 400);
	const origin = c.req.header('Origin');
	if (origin && !allowedOrigin(origin)) return c.json({ error: 'Origin not allowed' }, 403);
	if (await isUnknownRoom(c.env.ROOM_INDEX, roomId))
		return c.json({ error: 'Room not found' }, 404);
	const id = c.env.ROOMS.idFromName(roomId);
	return c.env.ROOMS.get(id).fetch(c.req.raw);
});

app.all('*', (c) => c.json({ error: 'Not found' }, 404));

export default app;

async function isUnknownRoom(index: KVNamespace | undefined, roomId: string) {
	if (!index) return false;
	return !(await index.get(roomId));
}

async function createRoomId(index: KVNamespace | undefined) {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const roomId = nanoid(8).toLowerCase();
		if (!index || !(await index.get(roomId))) return roomId;
	}
	throw new Error('Room idを生成できませんでした');
}

function allowedOrigin(origin: string | undefined) {
	if (!origin) return undefined;
	try {
		const url = new URL(origin);
		const hostname = url.hostname;
		if (origin === 'https://daihugou.pages.dev') return origin;
		if (hostname.endsWith('.daihugou.pages.dev')) return origin;
		if (hostname === 'localhost' || hostname === '127.0.0.1') return origin;
		return undefined;
	} catch {
		return undefined;
	}
}

function applyCorsHeaders(headers: Headers, origin: string | undefined) {
	if (!origin) return;
	headers.set('access-control-allow-origin', origin);
	headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
	headers.set('access-control-allow-headers', 'Content-Type');
	headers.append('vary', 'Origin');
}
