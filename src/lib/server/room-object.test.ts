import { describe, expect, it } from 'vitest';
import type { ClientCommand, ServerEvent } from '../game/types';
import { DaihugouRoom } from './room-object';

type TestConnection = {
	ws: WebSocket;
	playerId?: string;
};

type TestRoom = {
	handle(connection: TestConnection, command: ClientCommand): Promise<void>;
};

function harness() {
	const storage = new Map<string, unknown>();
	const durableState = {
		id: { toString: () => 'durable-room-id' },
		storage: {
			get(key: string) {
				return Promise.resolve(storage.get(key));
			},
			put(key: string, value: unknown) {
				storage.set(key, value);
				return Promise.resolve();
			},
		},
	} as unknown as DurableObjectState;
	const room = new DaihugouRoom(durableState, {});
	const handle = (room as unknown as TestRoom).handle.bind(room);
	return { handle };
}

function connection() {
	const events: ServerEvent[] = [];
	const ws = {
		send(data: string) {
			events.push(JSON.parse(data) as ServerEvent);
		},
	} as unknown as WebSocket;
	return { connection: { ws } satisfies TestConnection, events };
}

function latestError(events: ServerEvent[]) {
	const event = events.at(-1);
	return event?.type === 'error' ? event.message : undefined;
}

describe('DaihugouRoom command authorization', () => {
	it('rejects privileged commands before join and from non-host players', async () => {
		const { handle } = harness();
		const host = connection();
		const guest = connection();
		const anonymous = connection();

		await handle(anonymous.connection, { type: 'start' });
		expect(latestError(anonymous.events)).toMatch(/先に参加/);

		await handle(host.connection, { type: 'join', name: 'host' });
		const hostJoined = host.events.find((event) => event.type === 'joined');
		expect(hostJoined).toMatchObject({ type: 'joined' });

		await handle(guest.connection, { type: 'join', name: 'guest' });
		await handle(guest.connection, { type: 'updateRules', rules: { reverse9: false } });
		expect(latestError(guest.events)).toMatch(/ホスト/);

		await handle(host.connection, { type: 'updateRules', rules: { reverse9: false } });
		expect(latestError(host.events)).toBeUndefined();
	});

	it('requires a matching token to rejoin a player slot', async () => {
		const { handle } = harness();
		const host = connection();
		const attacker = connection();

		await handle(host.connection, { type: 'join', name: 'host' });
		const hostJoined = host.events.find((event) => event.type === 'joined');
		if (!hostJoined || hostJoined.type !== 'joined') throw new Error('join failed');

		await handle(attacker.connection, {
			type: 'join',
			name: 'attacker',
			playerId: hostJoined.playerId,
			token: 'wrong',
		});

		expect(latestError(attacker.events)).toMatch(/トークン/);
	});

	it('rejects reset while a game is still active', async () => {
		const { handle } = harness();
		const host = connection();
		const guest = connection();

		await handle(host.connection, { type: 'join', name: 'host' });
		await handle(guest.connection, { type: 'join', name: 'guest' });
		await handle(host.connection, { type: 'start' });
		await handle(host.connection, { type: 'reset' });

		expect(latestError(host.events)).toMatch(/終了後/);
	});
});
