# 匿名燃烧计数 Worker

只对外开放无请求体的 `POST /burn`，返回 `{ "count": 整数 }`。Durable Object 仅保存最近 24 个 UTC 小时的聚合整数。

部署前还需在 Cloudflare 账户层确认：关闭 Workers Logs、Logpush、请求事件采样和账户级 Web Analytics。`wrangler.toml` 已关闭项目观测与 Wrangler 指标。生产 URL 只通过 `VITE_BURN_COUNT_ENDPOINT` 注入客户端，仓库不保存凭据。

