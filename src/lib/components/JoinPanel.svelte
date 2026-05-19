<script lang="ts">
export let name: string;
export let roomId: string;
export let apiBaseInput: string;
export let error: string;
export let onCreateRoom: () => void;
export let onConnect: () => void;
</script>

<section class="hero">
	<div>
		<p class="eyebrow">Daifugō / President</p>
		<h1>大富豪 Online</h1>
		<p class="lead">4人制限なし。人数に応じてデッキを増やす、Cloudflare Workers + Durable Objects 前提のリアルタイム大富豪MVPです。</p>
	</div>
	<div class="panel join-panel">
		<label>
			名前
			<input bind:value={name} placeholder="Kan" />
		</label>
		<label>
			API Base（ローカルWorker等。空なら同一オリジン）
			<input bind:value={apiBaseInput} placeholder="http://localhost:8787" />
		</label>
		<div class="row">
			<button class="primary" on:click={onCreateRoom}>部屋を作る</button>
			<input class="room-input" bind:value={roomId} placeholder="room id" />
			<button on:click={onConnect} disabled={!roomId}>参加</button>
		</div>
		{#if error}<p class="error">{error}</p>{/if}
	</div>
</section>
