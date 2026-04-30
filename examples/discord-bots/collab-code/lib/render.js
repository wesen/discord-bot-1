const ui = require("./ui")

// ── Session Card ────────────────────────────────────────────────────────────

function renderSessionCard(session, snapshot, participants, maxParticipants, locked, canEdit) {
  const lockedColor = locked ? 0xFEE75C : 0x5865F2
  const card = ui.card(session.title)
    .description(snapshot ? truncateCode(snapshot.code, 300) : "_No code yet. Use /collab code to submit._")
    .color(lockedColor)

  if (snapshot) {
    card.meta("Language", normalizeLanguage(snapshot.language), true)
    card.meta("Version", String(snapshot.version), true)
  }

  card.meta("Locked", locked ? `by <@${session.locked_by}>` : "No", true)
  card.meta("Participants", `${participants.length}/${maxParticipants}`)
  card.footer(`Session ID: ${session.id}`)

  return card.build()
}

function renderStartCard(session, username, maxParticipants) {
  return ui.embed(session.title)
    .color(0x57F287)
    .description("A new collaborative code session has begun.")
    .field("Language", session.language || "text", true)
    .field("Version", "1", true)
    .field("Participants", "1", true)
    .field("Max participants", String(maxParticipants), true)
    .footer(`Session ID: ${session.id}`)
    .build()
}

// ── Participant List ────────────────────────────────────────────────────────

function renderParticipantList(participants, session) {
  const sorted = [...participants].sort((a, b) => {
    const rank = { owner: 0, moderator: 1, participant: 2 }
    return (rank[a.role] || 3) - (rank[b.role] || 3)
  })

  const lines = sorted.map((p) => {
    const roleIcon = p.role === "owner" ? "👑" : p.role === "moderator" ? "⚡" : "•"
    const editTag = p.edits_count > 0 ? ` (${p.edits_count} edits)` : ""
    return `${roleIcon} <@${p.user_id}> — ${p.nickname || p.username}${editTag}`
  })

  return ui.embed("Participants")
    .color(0x5865F2)
    .description(lines.join("\n") || "No participants.")
    .field("Total", String(participants.length), true)
    .footer(`Session: ${session.title} · Owner: <@${session.owner_id}>`)
    .build()
}

// ── Code Block ─────────────────────────────────────────────────────────────

function renderCodeBlock(snapshot, showFull = false) {
  const code = snapshot ? snapshot.code : ""
  const language = normalizeLanguage(snapshot ? snapshot.language : "text")
  const truncated = showFull ? code : truncateCode(code, 1000)

  const lines = truncated.split("\n").slice(0, 30)
  const codeText = "```" + language + "\n" + lines.join("\n") + "```"

  return {
    language,
    code: truncated,
    lines: lines.length,
    truncated: code.length > truncated.length,
    formatted: codeText,
  }
}

// ── Version History ─────────────────────────────────────────────────────────

function renderVersionHistory(history, currentVersion) {
  const lines = history.map((s, i) => {
    const marker = s.version === currentVersion ? "→" : " "
    return `${marker} **v${s.version}** — ${s.author_name} — ${s.change_description || "(no description)"}`
  })

  return ui.embed(`Version history (${history.length} versions)`)
    .color(0xFEE75C)
    .description(lines.join("\n") || "No versions yet.")
    .build()
}

// ── Run Result ─────────────────────────────────────────────────────────────

function renderRunResult(result, language) {
  const color = result.exitCode === 0 ? 0x57F287 : 0xED4245
  return ui.embed("Execution result")
    .color(color)
    .description(result.error || result.output || "(no output)")
    .field("Exit code", String(result.exitCode), true)
    .field("Duration", `${result.durationMs}ms`, true)
    .field("Language", language, true)
    .build()
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function truncateCode(code, maxLen) {
  const trimmed = String(code || "").slice(0, maxLen)
  if ((code || "").length > maxLen) {
    return trimmed + "\n..."
  }
  return trimmed
}

function normalizeLanguage(lang) {
  const text = String(lang || "").toLowerCase().trim()
  const aliases = {
    js: "javascript", ts: "typescript",
    py: "python", rb: "ruby",
    go: "go", rs: "rust",
    c: "c", cpp: "cpp",
    java: "java", cs: "csharp",
    sh: "bash", shell: "bash",
    sql: "sql", css: "css",
    html: "html", json: "json",
    yml: "yaml", md: "markdown",
  }
  return aliases[text] || text || "text"
}

module.exports = {
  renderSessionCard,
  renderStartCard,
  renderParticipantList,
  renderCodeBlock,
  renderVersionHistory,
  renderRunResult,
  truncateCode,
  normalizeLanguage,
}
