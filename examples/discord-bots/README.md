# Example Discord bot implementations

This repository exercises the named bot runner model.

## Docs

If you want the full API reference or a step-by-step bot-building playbook, load the embedded help pages from the CLI:

```bash
GOWORK=off go run ./cmd/discord-bot help discord-js-bot-api-reference
GOWORK=off go run ./cmd/discord-bot help build-and-run-discord-js-bots
```

The source files for those help pages live in the repo at:
- `pkg/doc/topics/discord-js-bot-api-reference.md` — comprehensive API reference for the JavaScript bot DSL, handler contexts, payload shapes, and outbound Discord operations
- `pkg/doc/tutorials/building-and-running-discord-js-bots.md` — step-by-step tutorial covering repository layout, command and event registration, buttons, modals, autocomplete, runtime config, and troubleshooting

If you want the public embedding paths instead of the standalone repo-driven CLI, see:
- `examples/framework-single-bot/` — minimal Go application using `pkg/framework`
- `examples/framework-custom-module/` — explicit bot plus a custom Go-native `require("app")` module
- `examples/framework-combined/` — downstream app combining one explicit built-in bot with repo-driven bots via `pkg/botcli`

## Bots

- `ping/` — Discord JS API showcase with buttons, modals, autocomplete, and outbound operations
- `knowledge-base/` — SQLite-backed knowledge steward with passive capture, teach/remember modals, search/article/review commands, and source-backed entries
- `support/` — deferred/edit/follow-up interaction flow, embeds, buttons, guild event, and thread utility helpers
- `moderation/` — embeds, components, ephemeral responses, message lifecycle, reaction, guild-member events, guild/role/member lookup helpers, message history helpers, member moderation host APIs, message moderation utilities, and channel utility helpers
- `poker/` — video poker hand management, Hold'em action advice, buttons, and modals
- `interaction-types/` — demo of all Discord application command interaction types: slash commands, subcommands, user context menu commands, and message context menu commands
- `ui-showcase/` — comprehensive UI DSL showcase: builder patterns, modal forms, stateful search/review screens, paginated lists, card galleries, confirmations, all select menu types, and alias registration
- `soup/` — no-database soup-making bot using the Go-side UI DSL for cards, selects, buttons, and a customization modal
- `show-space/` — venue operations bot for upcoming shows, announcement posting, pin management, DB-backed show records, and a debug dashboard for role troubleshooting
- `announcements.js` — root-level bot script to exercise direct file discovery
- `unified-demo/` — demonstrates the new unified pattern: `defineBot(...)` for Discord behavior plus `__verb__("run")` / `__verb__("status")` metadata for CLI integration

## Embedding one explicit bot from Go

The repository now also exposes a public single-bot package for downstream embedders who do **not** want repository scanning.

Minimal example app:

```bash
GOWORK=off go run ./examples/framework-single-bot
```

That example:
- imports `github.com/manuel/wesen/2026-04-20--js-discord-bot/pkg/framework`
- selects one explicit script with `framework.WithScript(...)`
- loads credentials with `framework.WithCredentialsFromEnv()`
- injects `ctx.config` values with `framework.WithRuntimeConfig(...)`
- optionally syncs commands on startup with `framework.WithSyncOnStart(true)`

For the next extension seam beyond runtime config, see:

```bash
GOWORK=off go run ./examples/framework-custom-module
```

That example shows `framework.WithRuntimeModuleRegistrars(...)` with one explicit bot script that calls `require("app")`.

## Example commands

Use the root-level `--bot-repository` flag to choose which bot repository roots are scanned. The flag is repeatable and applies to `bots list`, `bots help`, and discovered bot verbs such as `bots knowledge-base run`.

Structured bot inventory and metadata:

```bash
GOWORK=off go run ./cmd/discord-bot --bot-repository ./examples/discord-bots bots list --output json
GOWORK=off go run ./cmd/discord-bot --bot-repository ./examples/discord-bots bots help ping --output json
GOWORK=off go run ./cmd/discord-bot --bot-repository ./examples/discord-bots bots help unified-demo --output json
```

Run discovered bot verbs exposed from bot scripts:

```bash
GOWORK=off go run ./cmd/discord-bot --bot-repository ./examples/discord-bots bots unified-demo status --output json
GOWORK=off go run ./cmd/discord-bot --bot-repository ./examples/discord-bots bots unified-demo run --help
GOWORK=off go run ./cmd/discord-bot --bot-repository ./examples/discord-bots bots unified-demo run \
  --bot-token "$DISCORD_BOT_TOKEN" \
  --application-id "$DISCORD_APPLICATION_ID" \
  --guild-id "$DISCORD_GUILD_ID" \
  --db-path ./examples/discord-bots/unified-demo/data/demo.sqlite \
  --api-key local-demo-key

GOWORK=off go run ./cmd/discord-bot --bot-repository ./examples/discord-bots bots knowledge-base run --help
GOWORK=off go run ./cmd/discord-bot --bot-repository ./examples/discord-bots bots knowledge-base run \
  --bot-token "$DISCORD_BOT_TOKEN" \
  --application-id "$DISCORD_APPLICATION_ID" \
  --guild-id "$DISCORD_GUILD_ID" \
  --db-path ./examples/discord-bots/knowledge-base/data/knowledge.sqlite \
  --capture-enabled \
  --review-limit 10
```

If `--bot-repository` is omitted, `discord-bot` still falls back to `DISCORD_BOT_REPOSITORIES` and then `./examples/discord-bots` for local development.

## Runtime notes

- Use `/ping` for the JS showcase bot with buttons, modals, autocomplete, outbound operations, and a deferred `/search` demo.
- `/search` shows a private "Searching..." state, waits about 2 seconds, then edits in the results.
- Component interactions in `ui-showcase` now default to in-place updates (`UPDATE_MESSAGE`) so button/select flows stay in one message thread unless the handler explicitly opts into a new follow-up.
- `unified-demo` demonstrates the new unified pattern: `__verb__("run", { fields: ... })` declares the CLI schema, Glazed parses the flags, and the host injects the parsed values into the running bot as `ctx.config.*`.
- `knowledge-base` has also been migrated to the same host-managed `__verb__("run")` pattern, so a real non-trivial example now uses jsverbs-declared run metadata instead of `configure({ run: ... })`.
- The field-name bridge converts kebab-case CLI flags into snake_case config keys; for example `--db-path` becomes `ctx.config.db_path`, `--api-key` becomes `ctx.config.api_key`, and `--review-limit` becomes `ctx.config.review_limit`.
- `support` now also includes `support-fetch-thread`, `support-join-thread`, `support-leave-thread`, and `support-start-thread` to demonstrate the DISCORD-BOT-014 thread utility helpers.
- Use `/poker-help` in Discord to see the command list and examples.
- `/poker-help` includes quick-action buttons and modal entry points for rank/action examples.
- `knowledge-base` listens passively for knowledge candidates in opted-in channels, records them to SQLite, and adds `/remember`, `/teach`, `/ask`, `/kb-search`, `/article`, `/kb-article`, `/review`, `/kb-review`, `/kb-verify`, `/kb-stale`, `/kb-reject`, `/recent`, and `/kb-recent`.
- The review queue now uses a select menu, action buttons, and an edit modal, trusted reactions can promote a captured message into the review queue, and `/ask` / `/kb-search` now return rich result cards with source citations, related-entry hints, source detail views, pagination, autocomplete, and an export-to-channel action.
- `!support`, `!modping`, `!poker`, `!soup`, and `!pingjs` message triggers exercise each bot's own `messageCreate` handling.
- `moderation` now also logs message edit/delete lifecycle events, reaction add/remove events, and guild member join/update/remove events to demonstrate the early DISCORD-BOT-009 event-expansion slices.
- `moderation` also now includes host-backed `mod-add-role`, `mod-timeout`, `mod-kick`, `mod-ban`, and `mod-unban` commands that demonstrate `ctx.discord.members.*` operations using explicit Discord IDs.
- `moderation` now also includes `mod-list-messages`, `mod-fetch-message`, `mod-pin`, `mod-unpin`, `mod-list-pins`, `mod-bulk-delete`, `mod-fetch-channel`, `mod-set-topic`, `mod-set-slowmode`, `mod-fetch-guild`, `mod-list-roles`, `mod-fetch-role`, `mod-fetch-member`, and `mod-list-members` to demonstrate the DISCORD-BOT-010 message/channel moderation utilities, the DISCORD-BOT-011 guild/role lookup helpers, the DISCORD-BOT-012 member lookup helpers, and the new DISCORD-BOT-013 message history helpers.
- The moderation example is now split across `lib/register-*.js` modules to demonstrate the preferred in-bot composition pattern as the bot grows.
- `ui-showcase` demonstrates the UI DSL builder pattern with commands: `/demo-message` (builders), `/demo-form` (modal DSL), `/demo-search` and `/find` (stateful search with pager), `/demo-review` (review queue with select and action buttons), `/demo-confirm` (confirmation dialogs), `/demo-pager` (paginated list), `/demo-cards` and `/browse` (card gallery with select), `/demo-selects` (all select menu types), and `/demo-alias` / `/demo-alias-alt` (alias registration). The showcase now uses the Go-side `require("ui")` module for builders, so component interactions update messages in place instead of creating a new message for every click.
- `show-space` currently includes `/debug`, `/debug-roles`, `/debug-my-roles`, `/upcoming`, `/announce`, `/add-show`, `/show`, `/cancel-show`, `/archive-show`, `/past-shows`, `/unpin-old`, and `/archive-expired` for role troubleshooting, show listings, announcement posting, show records, cancellation/archival, and pin cleanup in the venue Discord server.
- The bot can run in phase-1 mode with seeded JSON data only, or in phase-2 mode with `dbPath` configured for SQLite-backed persistence.

## Moderation / event prerequisites

- Event-heavy moderation flows depend on gateway intents including:
  - `GuildMessages`
  - `GuildMessageReactions`
  - `GuildMembers`
  - `MessageContent`
- Moderation commands must be run in a guild context.
- `mod-add-role`, `mod-timeout`, `mod-kick`, and `mod-ban` require the bot to have the corresponding Discord permissions and sufficient role hierarchy over the target member/role.
- `mod-unban` requires unban permissions in the guild.
- `mod-pin`, `mod-unpin`, and `mod-bulk-delete` require message-management permission in the target channel.
- `mod-list-messages`, `mod-fetch-message`, and `mod-list-pins` require read/message-history access in the target channel.
- `mod-set-topic` and `mod-set-slowmode` require channel-management permission in the target channel.
- `mod-fetch-guild`, `mod-list-roles`, and `mod-fetch-role` require the bot to be able to view the target guild and roles; they are read-only helpers but still depend on normal guild visibility.
- `mod-fetch-member` and `mod-list-members` require the bot to be able to view guild member data; they are read-only helpers but still depend on guild/member visibility and any relevant member intent configuration.
- `support-fetch-thread`, `support-join-thread`, `support-leave-thread`, and `support-start-thread` require the bot to be able to view and participate in the target thread/channel, plus any relevant thread creation or management permissions.
- The current `timeout(...)` slice supports `durationSeconds`, `until`, and `clear: true`; it does not yet send an audit-log reason.
- The current `ban(...)` slice supports `reason` and `deleteMessageDays`.
- `mod-bulk-delete` currently accepts comma-separated message IDs and normalizes them into a cleaned ID list before calling the host API.
