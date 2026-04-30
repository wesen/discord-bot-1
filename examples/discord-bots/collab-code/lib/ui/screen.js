// UI DSL stateful screen helper for collaborative code sessions.
//
// Manages per-user per-channel state for session screens that persist across
// interactions (search results, review queues, paginated lists).
//
// Usage:
//   const search = ui.flow("collab.search", {
//     init: { query: "", page: 1, selectedId: "" },
//   })
//
//   search.save(ctx, { query: "hello", page: 1, selectedId: "" })
//   const state = search.load(ctx)
//   search.id("select")  // -> "collab.search:select"
//   search.pagerIds()    // -> { previous: "collab.search:previous", next: "collab.search:next" }

function flow(namespace, options) {
  const opts = options || {}
  const ns = String(namespace || "flow")
  const init = opts.init || {}

  function stateKey(ctx) {
    const guildId = String((ctx.guild && ctx.guild.id) || "dm").trim() || "dm"
    const channelId = String((ctx.channel && ctx.channel.id) || "unknown").trim() || "unknown"
    const userId = String((ctx.user && ctx.user.id) || (ctx.me && ctx.me.id) || "unknown").trim() || "unknown"
    return `${ns}.state.${guildId}.${channelId}.${userId}`
  }

  function load(ctx) {
    const stored = ctx.store.get(stateKey(ctx), null)
    if (!stored || typeof stored !== "object") {
      return mergeInit({}, init)
    }
    return mergeInit(stored, init)
  }

  function save(ctx, state) {
    const normalized = mergeInit(state || {}, init)
    ctx.store.set(stateKey(ctx), normalized)
    return normalized
  }

  function clear(ctx) {
    ctx.store.delete(stateKey(ctx))
  }

  function id(suffix) {
    return `${ns}:${suffix}`
  }

  function componentIds(names) {
    const ids = {}
    for (const name of names || []) {
      ids[name] = id(name)
    }
    return ids
  }

  function pagerIds() {
    return {
      previous: id("previous"),
      next: id("next"),
    }
  }

  return {
    namespace: ns,
    stateKey,
    load,
    save,
    clear,
    id,
    componentIds,
    pagerIds,
  }
}

function mergeInit(state, init) {
  const merged = {}
  for (const key of Object.keys(init || {})) {
    if (state[key] === undefined) {
      merged[key] = init[key]
    } else {
      merged[key] = state[key]
    }
  }
  // Copy any extra state keys not in init
  for (const key of Object.keys(state || {})) {
    if (merged[key] === undefined) {
      merged[key] = state[key]
    }
  }
  return merged
}

// ── Alias registration helper ───────────────────────────────────────────────

/**
 * Register the same command handler under multiple names.
 *
 *   ui.alias(command, ["ask", "kb-search"], { description: "...", options: {...} }, handler)
 */
function alias(registerCommand, names, spec, handler) {
  const nameList = Array.isArray(names) ? names : [names]
  for (const name of nameList) {
    registerCommand(name, spec, handler)
  }
}

// ── Autocomplete alias helper ────────────────────────────────────────────────

/**
 * Register the same autocomplete handler for multiple command/option pairs.
 *
 *   ui.aliasAutocomplete(autocomplete, [
 *     { command: "ask", option: "query" },
 *     { command: "kb-search", option: "query" },
 *   ], handler)
 */
function aliasAutocomplete(registerAutocomplete, entries, handler) {
  for (const entry of entries || []) {
    registerAutocomplete(entry.command, entry.option, handler)
  }
}

module.exports = {
  flow,
  alias,
  aliasAutocomplete,
}
