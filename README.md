# 大富豪 Online

多人数で遊べる大富豪（President / Daifugō）の Web MVP です。公開リポジトリ前提で、秘密情報を含めない構成にしています。

## Stack

- UI: SvelteKit + Svelte 5（静的ビルド / Cloudflare Pages 想定）
- API: Hono on Cloudflare Workers
- Realtime state: Cloudflare Durable Objects + WebSocket
- Room index: Cloudflare KV（24h TTL の軽い索引）
- Formatter / linter: Biome

## MVP rules

- 2人以上で開始
- 人数に応じてデッキ数を自動増加（8人ごとに1デッキ）
- ルールはロビーでON/OFF可能
- 同じ数字の複数枚出し
- 階段（同じマークの連番3枚以上）
- 場と同じ種類・枚数で、通常時はより強い数字、革命/11バック中はより弱い数字
- 縛り
- 8切り
- 革命 / 革命返し（4枚以上、5枚以上の階段）
- 11バック
- スペ3返し
- 5飛ばし
- 9リバース
- 反則上がり（Joker/2/8/J/スペ3返し）
- 全員パスで場流れ
- 手札がなくなった順に順位確定

今後候補: 7渡し、10捨て、都落ち、階級とカード交換、より細かいローカルルールプリセット。

## Local development

```bash
npm install
npm run dev:worker
npm run dev
```

UI で `API Base` に `http://127.0.0.1:8787`（ポートを変えた場合はその値）を入れて部屋を作成してください。

## Checks

```bash
npm run format
npm run check
npm run build
npx wrangler deploy --dry-run --outdir .wrangler/dry-run
```

## Cloudflare setup

1. KV namespace を作成して `wrangler.toml` の `ROOM_INDEX` に本番/preview ID を入れる
2. Worker API を deploy

```bash
npm run deploy:worker
```

3. Pages project を作成し、UI を deploy

```bash
npm run deploy:pages
```

Pages と Worker を同一ドメイン配下に置かない場合は、UI の `API Base` に Worker の URL を設定してください。CORS は MVP 用に `*` 許可にしています。
