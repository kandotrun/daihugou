import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { nanoid } from 'nanoid';
import { DaihugouRoom } from './lib/server/room-object';

export { DaihugouRoom };

type Env = {
	ROOMS: DurableObjectNamespace;
	ROOM_INDEX?: KVNamespace;
};

const app = new Hono<{ Bindings: Env }>();

app.use(
	'*',
	cors({ origin: '*', allowHeaders: ['Content-Type'], allowMethods: ['GET', 'POST', 'OPTIONS'] }),
);

app.get('/health', (c) => c.json({ ok: true, service: 'daihugou-api' }));

app.post('/api/rooms', async (c) => {
	const roomId = nanoid(8).toLowerCase();
	const id = c.env.ROOMS.idFromName(roomId);
	const stub = c.env.ROOMS.get(id);
	await stub.fetch(new Request('https://room.local/state', { headers: { 'x-room-id': roomId } }));
	await c.env.ROOM_INDEX?.put(roomId, JSON.stringify({ roomId, createdAt: Date.now() }), {
		expirationTtl: 60 * 60 * 24,
	});
	return c.json({ roomId });
});

app.get('/api/rooms/:roomId/state', (c) => {
	const id = c.env.ROOMS.idFromName(c.req.param('roomId'));
	const roomId = c.req.param('roomId');
	return c.env.ROOMS.get(id).fetch(
		new Request('https://room.local/state', { headers: { 'x-room-id': roomId } }),
	);
});

app.get('/api/rooms/:roomId/socket', (c) => {
	const id = c.env.ROOMS.idFromName(c.req.param('roomId'));
	return c.env.ROOMS.get(id).fetch(c.req.raw);
});

app.all('*', (c) => c.json({ error: 'Not found' }, 404));

export default app;
