# Daihugou

人数無制限寄りの「大富豪」Web アプリ MVP です。公開リポジトリ前提で、秘密情報や private な設定は含めていません。

## Stack

- React + React Router 7 + Vite
- Cloudflare Workers + Durable Objects（ルームごとのリアルタイム状態）
- TypeScript
- Biome（formatter/linter）
- Vitest（カード/ゲームロジックのユニットテスト）

## Local development

```bash
npm install
npm run dev
```

Worker/Durable Object を含めて確認する場合:

```bash
npm run build
npm run dev:worker
```

## Deploy

Cloudflare にログイン後:

```bash
npx wrangler deploy
```

初回デプロイ前に `wrangler.jsonc` の `name` や compatibility date を必要に応じて確認してください。

## Game notes

- 1 ルームに任意人数が参加できます（実運用上の上限は Worker/Durable Object/WebSocket の制約に依存）。
- MVP ルール: 通常の 52 枚 + Joker 1 枚、3 が最弱、2 が最強、Joker は単体最強。
- 同じ枚数・同じランクのカードだけを出せます。
- 場のカードより強い組だけ出せます。
- 全員が pass したら場が流れ、最後に出したプレイヤーから再開します。

今後入れやすい拡張: 革命、8 切り、縛り、都落ち、階段、複数 Joker、観戦専用参加。
