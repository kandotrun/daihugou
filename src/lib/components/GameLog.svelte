<script lang="ts">
import type { GameLogEntry } from '$lib/game/types';

export let entries: GameLogEntry[];
</script>

<section class="panel log">
	<h2>Log</h2>
	{#each entries as entry (entry.id)}
		<p><time>{new Date(entry.at).toLocaleTimeString('ja-JP')}</time> {entry.message}</p>
	{/each}
</section>
