## Biggest practical upgrades since that report

### 1) Upgrade tooling to Vite 8 (Rolldown-powered)

Your report said “Vite 4”. That’s old news now.

**Vite 8 Beta** is **Rolldown-powered** (Rust bundler) and the Vite team explicitly calls out big performance gains — *native-speed bundling*, “**10–30× faster than Rollup**,” plus better chunk control, persistent cache, and module federation possibilities. ([vitejs][1])

Why this matters for performance:

* Faster builds = you can afford more aggressive optimization passes in CI (minification checks, Lighthouse CI, bundle audits) without hating your life.
* Better chunking control helps you keep the **initial route ultra-thin** (which *directly* impacts Lighthouse TBT/INP).

**Recommendation:** Move the stack’s baseline to **Vite 8 + Rolldown** (even if you keep Qwik/SvelteKit/etc.). ([vitejs][1])

---

### 2) Add Lightning CSS to the pipeline (CSS transforms/minification at warp speed)

If you’re going all-in on squeezing perf, **Lightning CSS** is a legit build-time weapon: it’s Rust-based, and claims **100× faster** than comparable JS tools, with minification throughput in the *millions of lines per second*. ([lightningcss.dev][2])

Where it helps:

* Faster + better CSS minification/transforming means you can ship smaller CSS with less build pain.
* Pairs nicely with utility CSS (Tailwind/UnoCSS) and modern bundlers.

**Recommendation:** Use Lightning CSS for minification/transform, even if you keep Tailwind or UnoCSS. ([lightningcss.dev][2])

---

### 3) If you care about “free + open-source”: swap Redis → Valkey

Your report used Redis. But Redis’ licensing shift triggered the creation of **Valkey**, a **BSD-licensed** fork under the Linux Foundation, explicitly positioned as the “keep it truly open source” path. ([Linux Foundation][3])

For your requirement (“free locally” + open source where possible), Valkey is the cleaner choice.

**Recommendation:** **Valkey** (drop-in compatible for most Redis use) for cache + pub/sub. ([Linux Foundation][3])

---

### 4) Bun backend: consider Elysia or Hono instead of Fastify (or alongside)

Fastify is solid, but if your goal is “insane throughput on Bun”:

* **Elysia** is Bun-first and leans on optimization/static analysis; their docs claim it can outperform many frameworks and even match Go/Rust class performance in some cases. ([elysiajs.com][4])
* **Hono** is also positioned as one of the fastest options on Bun, with benchmark references in their docs. ([Hono][5])

**Reality check:** microbenchmarks can lie (DB + auth + serialization dominate in real apps). But if you’re chasing raw HTTP speed and low overhead, these are absolutely worth testing in *your* workload. ([Reddit][6])

**Recommendation (pragmatic):**

* Keep your core app SSR layer (Qwik/SvelteKit/etc.).
* Implement performance-critical APIs (chat gateway, presence, fanout) as a **Bun + Elysia** or **Bun + Hono** service.

---

## “Crush Lighthouse” features you should add

### 5) Speculation Rules API (near-instant navigations on MPAs)

This one is sneaky powerful: the **Speculation Rules API** lets the browser **prefetch or prerender likely next navigations**, giving “quicker — even instant — page navigations.” ([Chrome for Developers][7])

It’s still marked **experimental** on MDN, so you use it progressively (feature-detect and don’t rely on it). ([MDN Web Docs][8])

**Where it shines for your app-like site:**

* “Store → product page → checkout”
* “Chats list → open conversation”
* “AI tools list → tool detail → run tool”

**Micro example (safe to start):**

```html
<script type="speculationrules">
{
  "prerender": [
    { "source": "list", "urls": ["/store", "/chat"] }
  ],
  "prefetch": [
    { "source": "document", "where": { "href_matches": "/store/.*" } }
  ]
}
</script>
```

---

### 6) View Transitions API for modern animations without JS-heavy frameworks

For “modern UI with animations” that *doesn’t* tank performance, the **View Transition API** is a killer move: it enables **seamless transitions between views** (SPA *or* MPA) while you control animations in CSS/Web Animations. ([Chrome for Developers][9])

Chrome’s 2025 update also notes it’s becoming more standardized (“Baseline newly available” trajectory) and mentions integration work landing in React’s core/canary line. ([Chrome for Developers][10])

**Recommendation:** Use View Transitions for:

* route changes (store browsing)
* modal open/close
* item → details transitions
  …all while keeping your main thread calmer than a Framer Motion festival.

---

### 7) Partytown for third-party scripts (protect your main thread)

If you ever add analytics, chat widgets, payments, A/B testing, etc., third-party scripts are a Lighthouse-killer.

**Partytown** moves third‑party scripts into a **web worker** so your main thread stays focused on rendering + interactions. ([Partytown][11])

**Recommendation:** Default stance: *no third-party scripts on the critical route*, and if you must, use Partytown.

---

## TypeGPU + WebGPU: “insane performance” playground (and real product opportunities)

### 8) WebGPU is going mainstream — and that changes what “fast” can mean

As of late 2025, WebGPU availability has expanded a lot across major browsers/OS versions (with platform caveats). ([web.dev][12])

This matters for your use cases:

* **Game store**: GPU-accelerated 3D previews, particle effects, fancy transitions without janking CPU
* **Chat**: GPU-accelerated blur/background effects, sticker rendering, visualizations
* **AI tools**: some client-side compute tasks (or at least GPU-assisted postprocessing)

### 9) TypeGPU specifically

TypeGPU is a TypeScript toolkit for WebGPU with **advanced type inference** and the ability to **write shaders in TypeScript** (plus type-safe/declarative resource management). ([GitHub][13])

**How to use it without tanking Lighthouse:**

* Don’t load it on initial route.
* Only load TypeGPU on routes/features where it’s worth it (game previews, visualizer tool, etc.).
* Use it as a progressive enhancement: fallback UI if WebGPU isn’t available.

If you do this right, TypeGPU can deliver “wow” visuals **without** wrecking your core UX metrics.

---

## Real-time beyond WebSockets: WebTransport (bleeding edge)

If you want truly modern realtime transport, **WebTransport** is basically “WebSockets upgraded” over **HTTP/3**, supporting multiple streams and datagrams (unreliable UDP-like) depending on need. ([MDN Web Docs][14])

But: WebSocket-over-HTTP/3 adoption is messy; there are notes that it still lacks broad production implementations in browsers/servers in practice. ([WebSocket.org][15])

**Recommendation:**

* Today: keep **WebSockets** as your default.
* Experimental tier: prototype **WebTransport** for specific features (presence, game downloads telemetry, realtime multiplayer-ish features) where multiplexing/datagrams are valuable.

---

## Framework-level “new hotness” you should consider (depending on your UI choice)

### If you’re open to alternatives to Qwik

Qwik is still extremely strong for Lighthouse-style metrics, but the landscape moved:

* **Svelte 5 is stable** and the Svelte team describes it as a ground-up rewrite where apps become “faster, smaller and more reliable.” ([Svelte][16])
  If your app is interaction-heavy (chat-like), Svelte 5 is a serious contender.

### If you decide to go React (for ecosystem reasons)

React now has a big performance story too:

* **React Compiler 1.0** (stable release Oct 7, 2025) “automatically optimizes components and hooks” without rewrites, and is production-ready per React’s official post. ([React][17])
* If you’re React-based and chasing speed, this is *the* “new hotness” to watch.

Optional extra: **Million.js** aims to speed React up (claims “up to 70% faster than React,” with benchmark caveats). ([Million.js][18])

---

## If I were rewriting your “performance monster” stack today

### Production-lean (high confidence)

* **Frontend:** Qwik *or* Svelte 5 (SSR), UnoCSS/Tailwind
* **Navigation feel:** Speculation Rules (progressive) + View Transitions
* **Backend:** Bun + (Elysia *or* Hono) for APIs; keep SSR adapter lean
* **Data:** Postgres + **Valkey**
* **3rd party:** Partytown when needed
* **Tooling:** **Vite 8 (Rolldown)** + Lightning CSS + (Oxlint/Biome for fast CI)

### Experimental tier (only where it pays off)

* **TypeGPU/WebGPU** for GPU-heavy routes/features
* **WebTransport** for next-gen realtime where streams/datagrams help

---

If you tell me which of these matters most for your app (chat latency, store browsing speed, GPU effects, AI inference, etc.), I can take your original report and rewrite it into a **“v2 stack”** with:

* a “safe default” path
* an “insane mode” path
* and clear boundaries so you don’t accidentally blow Lighthouse just to get a shiny animation.

[1]: https://vite.dev/blog/announcing-vite8-beta?utm_source=chatgpt.com "Vite 8 Beta: The Rolldown-powered Vite"
[2]: https://lightningcss.dev/?utm_source=chatgpt.com "Lightning CSS"
[3]: https://www.linuxfoundation.org/blog/a-year-of-valkey?utm_source=chatgpt.com "Forking Ahead: A Year of Valkey"
[4]: https://elysiajs.com/at-glance?utm_source=chatgpt.com "At glance"
[5]: https://hono.dev/docs/concepts/benchmarks?utm_source=chatgpt.com "Benchmarks"
[6]: https://www.reddit.com/r/golang/comments/1p4e0tc/bun_elysia_is_faster_than_go_standard/?utm_source=chatgpt.com "Bun + Elysia is faster than Go Standard : r/golang"
[7]: https://developer.chrome.com/docs/web-platform/implementing-speculation-rules?utm_source=chatgpt.com "Guide to implementing speculation rules for more complex sites"
[8]: https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API?utm_source=chatgpt.com "Speculation Rules API - MDN Web Docs"
[9]: https://developer.chrome.com/docs/web-platform/view-transitions?utm_source=chatgpt.com "Smooth transitions with the View Transition API"
[10]: https://developer.chrome.com/blog/view-transitions-in-2025?utm_source=chatgpt.com "What's new in view transitions (2025 update) | Blog"
[11]: https://partytown.qwik.dev/?utm_source=chatgpt.com "Partytown - Qwik"
[12]: https://web.dev/blog/webgpu-supported-major-browsers?utm_source=chatgpt.com "WebGPU is now supported in major browsers | Blog"
[13]: https://github.com/software-mansion/TypeGPU?utm_source=chatgpt.com "software-mansion/TypeGPU: A modular and open-ended ..."
[14]: https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API?utm_source=chatgpt.com "WebTransport API - MDN Web Docs - Mozilla"
[15]: https://websocket.org/guides/future-of-websockets/?utm_source=chatgpt.com "The Future of WebSockets: HTTP/3 and WebTransport"
[16]: https://svelte.dev/blog/svelte-5-is-alive?utm_source=chatgpt.com "Svelte 5 is alive"
[17]: https://react.dev/blog/2025/10/07/react-compiler-1?utm_source=chatgpt.com "React Compiler v1.0"
[18]: https://old.million.dev/?utm_source=chatgpt.com "Million.js"
