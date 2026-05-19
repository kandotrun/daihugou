<script lang="ts">
export let name: string;
export let roomId: string;
export let apiBaseInput: string;
export let error: string;
export let activeApiBase: string;
export let onCreateRoom: () => void;
export let onConnect: () => void;
</script>

<section class="hero">
	<div class="brand-block">
		<p class="eyebrow">Daifugō table</p>
		<h1>大富豪</h1>
		<div class="table-meter">
			<span>Workers</span>
			<span>Durable Objects</span>
			<span>WebSocket</span>
		</div>
	</div>
	<div class="panel join-panel">
		<div class="join-title">
			<p>Room</p>
			<strong>{roomId || 'New table'}</strong>
		</div>
		<label>
			<span>名前</span>
			<input bind:value={name} placeholder="Kan" />
		</label>
		<div class="row">
			<button class="primary" on:click={onCreateRoom}>新しい卓</button>
			<label class="room-field">
				<span>部屋コード</span>
				<input class="room-input" bind:value={roomId} placeholder="例: a1b2c3d4" />
			</label>
			<button on:click={onConnect} disabled={!roomId}>入る</button>
		</div>
		<details class="endpoint">
			<summary>接続先</summary>
			<input bind:value={apiBaseInput} placeholder={activeApiBase} />
		</details>
		{#if error}<p class="error">{error}</p>{/if}
	</div>
</section>
