# WebMCP vs JAOS — Deep Analysis & Strategic Assessment

> **Date**: March 10, 2026
> **Repo analyzed**: [MiguelsPizza/WebMCP](https://github.com/MiguelsPizza/WebMCP) (~1,000 stars, AGPL-3.0)
> **Context**: Can WebMCP make the JAOS extension better at filling job applications?
> **TL;DR**: No — fundamentally different models. But there are 3 patterns worth stealing.

---

## Table of Contents

1. [What is WebMCP?](#1-what-is-webmcp)
2. [Architecture Deep Dive](#2-architecture-deep-dive)
3. [How It Actually Works](#3-how-it-actually-works)
4. [Can WebMCP Help JAOS?](#4-can-webmcp-help-jaos)
5. [Limitations That Kill It for JAOS](#5-limitations-that-kill-it-for-jaos)
6. [Cost Comparison](#6-cost-comparison)
7. [What We CAN Steal](#7-what-we-can-steal)
8. [Head-to-Head: WebMCP vs JAOS V2 Engine](#8-head-to-head-webmcp-vs-jaos-v2-engine)
9. [Verdict & Recommendation](#9-verdict--recommendation)

---

## 1. What is WebMCP?

WebMCP (formerly MCP-B) is an open-source protocol + Chrome extension that lets **websites voluntarily expose browser-based functions as MCP tools** that AI agents can call.

**MCP** = Model Context Protocol (by Anthropic) — a standard for connecting AI models to external tools.

**WebMCP's idea**: A website embeds a tiny MCP server in its page code → registers tools (like `addToCart`, `searchProducts`, `fillForm`) → the extension discovers these tools → AI assistants (Claude Desktop, Cursor, or the built-in chat) can call them.

### The Key Word: "Voluntarily"

The website **must opt-in** by embedding the WebMCP SDK (`@mcp-b/transports`) in their code. If they don't, the extension can only do basic stuff like read page content and manage tabs.

This is the fundamental difference from JAOS.

---

## 2. Architecture Deep Dive

WebMCP uses a **three-tier architecture**:

```
┌─────────────────────────────────────────────────────┐
│                    AI Assistant                       │
│         (Claude Desktop / Cursor / Sidepanel)         │
└──────────────────────┬──────────────────────────────┘
                       │ JSON-RPC 2.0
                       ▼
┌─────────────────────────────────────────────────────┐
│              LAYER 3: HUB (Service Worker)            │
│  - Central MCP server aggregating ALL tab tools       │
│  - Routes tool execution to correct tab               │
│  - Manages tool lifecycle (tab close = remove)        │
│  - Native messaging bridge (port 12306)               │
└──────────────────────┬──────────────────────────────┘
                       │ Chrome runtime messaging
                       ▼
┌─────────────────────────────────────────────────────┐
│           LAYER 2: PROXY (Content Script)             │
│  - Thin MCP client per tab                            │
│  - Relays tool registrations to Hub                   │
│  - Routes execution requests back to page             │
│  - 1:1 session with page server                       │
└──────────────────────┬──────────────────────────────┘
                       │ window.postMessage
                       ▼
┌─────────────────────────────────────────────────────┐
│         LAYER 1: PAGE SERVER (Website Tab)            │
│  - Website embeds @mcp-b/transports SDK               │
│  - Registers tools that wrap existing JS logic        │
│  - Full DOM access within the page's context          │
│  - Runs within page's auth context (cookies/sessions) │
└─────────────────────────────────────────────────────┘
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Monorepo | pnpm + Turborepo |
| Language | TypeScript throughout |
| Extension | WXT framework + React + Tailwind |
| Protocol | JSON-RPC 2.0 over MCP SDK |
| AI layer | Vercel AI SDK (provider-agnostic) |
| Native bridge | Node.js on port 12306 |
| Testing | Vitest + Playwright |
| Schema | Zod validation |

---

## 3. How It Actually Works

### For MCP-Enabled Websites (cooperative model)

```js
// Website embeds this in their code:
import { TabServerTransport } from '@mcp-b/transports';

const server = new MCPServer();
server.registerTool('addToCart', {
  description: 'Add a product to shopping cart',
  handler: async ({ productId }) => {
    // Website's own JS logic
    document.querySelector(`#product-${productId} .add-btn`).click();
    return { success: true };
  }
});
server.connect(new TabServerTransport());
```

1. Website creates MCP server with `TabServerTransport`
2. Extension content script detects it via `postMessage`
3. Tools flow up: Page → Proxy → Hub
4. AI calls tools which execute in page's full JS context
5. Results flow back through the chain

### For Regular Websites (non-cooperative)

The extension has a few **built-in browser tools**:
- Tab management (open, close, switch, group)
- Content extraction (read page text)
- Bookmark search
- History access

That's it. **No DOM manipulation, no form filling, no field detection.**

### Communication Protocol

All messages use JSON-RPC 2.0:

```
browser/registerTools   → proxy tells hub about available tools
browser/updateTools     → dynamic tool changes
browser/executeTool     → hub asks proxy to run a tool in a tab
```

- **Tab Transport**: `postMessage` (page ↔ content script)
- **Extension Transport**: Chrome runtime messaging (content script ↔ background)
- **Native Transport**: For Claude Desktop integration (port 12306)

---

## 4. Can WebMCP Help JAOS?

### Short answer: NO.

### Long answer with reasoning:

**JAOS's problem**: Fill job application forms on Greenhouse, Workday, Oracle Cloud, Lever, iCIMS, etc. — sites that we do NOT control.

**WebMCP's requirement**: The website MUST embed the `@mcp-b/transports` SDK and register tools voluntarily.

**Reality check**: Will Greenhouse, Workday, or Oracle Cloud ever embed WebMCP?

| ATS Platform | Will they add WebMCP? | Why? |
|---|---|---|
| Greenhouse | NO | They actively fight autofill extensions (disabled "Autofill with MyGreenhouse" button when our extension runs) |
| Workday | NO | Enterprise security concerns — they won't expose form tools to external AI |
| Oracle Cloud | NO | Oracle is the most conservative enterprise vendor imaginable |
| Lever | NO | Same — ATS platforms want candidates to manually fill forms (more engagement) |
| iCIMS | NO | No incentive to make auto-filling easier |

**ATS platforms are adversarial** — they:
- Use custom React components that block native form events
- Implement CAPTCHAs and bot detection
- Use dynamic IDs that change per page load
- Deliberately make automation difficult

WebMCP assumes a **cooperative model**. JAOS needs an **adversarial model**.

### The Models Are Fundamentally Opposite

```
WebMCP:  Website WANTS AI to interact → exposes tools → AI calls them
JAOS:    Website DOESN'T WANT automation → we scan DOM → LLM figures it out
```

This is like asking "can a house key open a safe?" — they're both about opening things, but one requires the lock maker's cooperation and the other doesn't.

---

## 5. Limitations That Kill It for JAOS

### 1. Cooperative Model = Dead on Arrival for ATS

No ATS platform will voluntarily embed MCP servers. Period. This alone makes WebMCP useless for our core use case.

### 2. No Universal DOM Scanner

WebMCP has no equivalent to JAOS's `scanner.js`. It doesn't:
- Scan arbitrary pages for form fields
- Detect field types (text, dropdown, checkbox, radio, file upload)
- Read labels and placeholder text
- Understand form structure without the website's help

### 3. No LLM Field Mapping

WebMCP doesn't map user profile data to form fields. The website tells the AI what tools exist — the AI doesn't need to figure anything out. JAOS's `mapper.js` (LLM decides what goes where) has no equivalent in WebMCP.

### 4. No ATS-Specific Adapters

WebMCP has no concept of:
- Greenhouse React quirks
- Workday multi-entry sections
- Oracle Cloud Knockout.js cx-select dropdowns
- Oracle Maps keyboard event requirements
- Address cascade behaviors

### 5. Extension No Longer Fully Open Source

The repo states: *"The MCP-B extension is no longer open source in its current form — the repo represents an older codebase maintained for historical reference."*

Active development moved to the WebMCP GitHub Organization. We can't fork and modify the latest version.

### 6. Native Host Required for Claude Desktop

Connecting to Claude Desktop requires installing a Node.js native messaging host — extra friction for users. JAOS runs entirely in the browser.

---

## 6. Cost Comparison

Both use the **BYOK (Bring Your Own Key)** model:

| | WebMCP | JAOS V2 |
|---|---|---|
| Extension cost | Free | Free |
| AI provider | User's API key (OpenAI, Anthropic, Google) | User's OpenRouter API key |
| Processing | Local (browser) | Local (browser) + LLM API call |
| Backend | None (all local) | FastAPI backend for profile management |
| Per-fill cost | Depends on AI provider | ~$0.01-0.05 per LLM mapper call (OpenRouter) |

**Cost is identical** — both offload AI costs to the user's own API key. No subscription, no SaaS fee.

**JAOS's LLM mapper cost**: One API call per form page (~200-500 tokens input, ~100-200 tokens output). At GPT-4o-mini rates via OpenRouter: ~$0.01-0.03 per fill. Negligible.

---

## 7. What We CAN Steal

While WebMCP's core model doesn't fit JAOS, three technical patterns are worth adopting:

### 1. WXT Framework (Extension Development)

**What**: Modern Chrome extension development framework (replaces vanilla Manifest V3 boilerplate)
**Why it's better**:
- Hot module reload during development
- TypeScript-first
- Cross-browser support (Chrome, Firefox, Edge) from one codebase
- Clean separation of content scripts, background, popup, sidepanel
- Built-in auto-imports

**JAOS impact**: Currently we use vanilla Manifest V3 JS files. WXT would:
- Speed up development (HMR instead of manually reloading)
- Add TypeScript safety to extension code
- Make cross-browser support trivial
- **Estimated effort**: Medium — would need to restructure extension files

### 2. Vercel AI SDK (Provider-Agnostic AI)

**What**: `ai` npm package — unified API for calling any AI provider (OpenAI, Anthropic, Google, Mistral, etc.)
**Why it's better than our current approach**:
- One API interface, swap providers with a config change
- Built-in streaming support
- Tool calling abstraction (structured outputs)
- Currently JAOS uses a custom `llm-client.js` that only talks to OpenRouter

**JAOS impact**: Could replace `engine/llm-client.js` with Vercel AI SDK:
```js
// Current (JAOS):
const response = await fetch('https://openrouter.ai/api/v1/...', { ... });

// With Vercel AI SDK:
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
const { text } = await generateText({ model: openai('gpt-4o-mini'), prompt: '...' });
```
- **Estimated effort**: Low — drop-in replacement for llm-client.js
- **Caveat**: Vercel AI SDK is designed for Node.js — may need bundling for service worker context

### 3. Native Messaging Bridge to Claude Desktop

**What**: Node.js native host (port 12306) that bridges Chrome extension ↔ Claude Desktop
**Why it's interesting**:
- Users could say "fill my Greenhouse application" in Claude Desktop
- Claude Desktop calls JAOS extension via native messaging
- Extension does the actual DOM work

**JAOS impact**: Future feature — "conversational job application filling":
- User opens Claude Desktop, says "apply to this job at [URL]"
- Claude orchestrates: open tab → detect ATS → scan fields → fill → review
- **Estimated effort**: High — new feature, not a replacement

### What NOT to Steal

| Pattern | Why Skip It |
|---|---|
| MCP-B protocol | Requires website cooperation — useless for ATS |
| `@mcp-b/transports` SDK | Same — wrong model |
| Tool registration system | JAOS discovers tools by scanning, not registration |
| Sidepanel chat UI | JAOS uses a slide-in panel, works fine |
| Cloudflare Workers backend | JAOS has its own FastAPI backend |

---

## 8. Head-to-Head: WebMCP vs JAOS V2 Engine

| Dimension | WebMCP | JAOS V2 Engine |
|---|---|---|
| **Model** | Cooperative (site opts in) | Adversarial (works on any site) |
| **Form discovery** | Website registers tools | Universal DOM scanner |
| **Field mapping** | Website defines mappings | LLM semantic mapping |
| **ATS coverage** | 0% (no ATS will embed MCP) | 80%+ generic, 95%+ with adapters |
| **DOM manipulation** | Delegated to website's own code | Direct via filler.js + adapters |
| **React support** | Website handles internally | Fiber bridge + synthetic events |
| **Knockout.js** | N/A | Full keyboard events + cx-select |
| **Address autocomplete** | N/A | Oracle Maps cascade, Google Places |
| **Resume upload** | N/A | DataTransfer API + ATS-specific selectors |
| **Multi-entry forms** | N/A | Click "Add" → MutationObserver → fill |
| **Offline capability** | Needs website MCP server running | Heuristic fallback works offline |
| **Cost per fill** | Same (BYOK) | Same (BYOK) |
| **Open source** | No longer (historical repo) | Yes (private repo) |

### The Jobright Comparison

Even Jobright (our direct competitor with 42 ATS handlers) uses the **adversarial model** — hardcoded XPath selectors + server-side GPT for value mapping. Nobody in the job autofill space uses a cooperative protocol because the fundamental constraint is: **ATS platforms don't cooperate**.

---

## 9. Verdict & Recommendation

### Can WebMCP make JAOS a beast at filling? NO.

**WebMCP solves a different problem.** It's a protocol for willing websites to expose tools to AI. JAOS needs to work on unwilling websites that actively resist automation.

### What JAOS Should Do Instead

**Double down on the V2 engine architecture** (universal scanner + LLM mapper + thin adapters):

1. **Generic engine covers 80%** of fields on any ATS without hardcoded selectors
2. **15 thin adapters** handle ATS-specific quirks (React fiber, Knockout cx-select, Oracle Maps, etc.)
3. **LLM mapper** makes semantic decisions (what data goes where) — no website cooperation needed
4. **Telemetry** tracks which fields fail, feeds back into adapter improvements

### Technology Upgrades Worth Considering (from WebMCP patterns)

| Upgrade | Priority | Effort | Impact |
|---|---|---|---|
| WXT framework | Medium | 2-3 days migration | Better DX, HMR, TypeScript |
| Vercel AI SDK | Low | 1 day swap | Provider flexibility |
| Native messaging → Claude Desktop | Low (future) | 3-5 days | Cool demo, not core value |

### Final Take

WebMCP is an elegant protocol for a cooperative web. JAOS operates in an uncooperative one. They're solving different problems. The V2 engine architecture (scanner → mapper → filler → adapter) is the right approach for job application autofill, and it's architecturally stronger than both WebMCP's cooperative model AND Jobright's brute-force XPath approach.

**Focus**: Ship the Oracle Cloud adapter, harden the generic engine, and hit 95% fill rate on the top 15 ATS platforms. That's the path to being a beast — not a protocol that needs the ATS to say "yes please, automate me."

---

> **Next step**: Build `adapters/oraclecloud-v2.js` using the verified seed scripts and rules from our research sessions.
