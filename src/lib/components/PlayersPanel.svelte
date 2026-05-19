<script lang="ts">
import type { PublicRoomState } from '$lib/game/types';

export let state: PublicRoomState;
export let playerId: string;
</script>

<aside class="panel players">
	<h2>Players</h2>
	{#each state.players as player, index (player.id)}
		<div class:active={player.id === state.turnPlayerId} class:me={player.id === playerId} class="player-row">
			<span>{state.winners.indexOf(player.id) >= 0 ? `#${state.winners.indexOf(player.id) + 1}` : index + 1}</span>
			<div>
				<strong>{player.name}{player.id === playerId ? '（あなた）' : ''}</strong>
				<p>{state.handCounts[player.id] ?? 0}枚 / {player.connected ? 'online' : 'offline'}</p>
			</div>
		</div>
	{/each}
</aside>
