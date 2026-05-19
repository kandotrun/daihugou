<script lang="ts">
import type { PublicRoomState, RuleSettings } from '$lib/game/types';

export let state: PublicRoomState;
export let ruleEntries: [keyof RuleSettings, string][];
export let onRuleChange: (key: keyof RuleSettings, checked: boolean) => void;
</script>

<section class="panel rules-panel">
	<div class="statusbar">
		<div>
			<p class="muted">Rule toggles</p>
			<h2>大富豪ルール設定</h2>
		</div>
		<p>{state.phase === 'lobby' ? '開始前のみ変更できます' : '進行中は固定'}</p>
	</div>
	<div class="rule-grid">
		{#each ruleEntries as [key, label]}
			<label class="rule-toggle">
				<input
					type="checkbox"
					checked={state.rules[key]}
					disabled={state.phase !== 'lobby'}
					on:change={(event) => onRuleChange(key, event.currentTarget.checked)}
				/>
				<span>{label}</span>
			</label>
		{/each}
	</div>
</section>
