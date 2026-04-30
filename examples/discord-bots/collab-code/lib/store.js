const database = require("database")

const DEFAULT_SESSION_TTL = 3600 // seconds
const DEFAULT_MAX_PARTICIPANTS = 10
const DEFAULT_MAX_SESSIONS = 5

function createCodeSessionStore() {
  // In-memory session state (backed by SQLite for persistence)
  let sessions = {}
  let participants = {} // sessionId -> Map<userId, participantInfo>
  let codeSnapshots = {} // sessionId -> array of snapshots
  let configured = false
  let configuredPath = ""

  function ensure(config) {
    const dbPath = configValue(config, ["dbPath", "db_path"], "./examples/discord-bots/collab-code/data/collab-code.sqlite")
    if (configured && configuredPath === dbPath) return

    try {
      database.close()
    } catch (err) {
      // ignored: the database module may not have been configured yet
    }

    database.configure("sqlite3", dbPath)
    configuredPath = dbPath
    ensureSchema()
    configured = true
  }

  function ensureSchema() {
    database.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT '',
        owner_id TEXT NOT NULL,
        owner_name TEXT NOT NULL DEFAULT '',
        guild_id TEXT NOT NULL DEFAULT '',
        channel_id TEXT NOT NULL DEFAULT '',
        thread_id TEXT NOT NULL DEFAULT '',
        message_id TEXT NOT NULL DEFAULT '',
        locked_by TEXT NOT NULL DEFAULT '',
        locked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_activity TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        code TEXT NOT NULL DEFAULT ''
      )
    `)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_guild ON sessions(guild_id)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_channel ON sessions(channel_id)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(owner_id)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity)`)

    database.exec(`
      CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL DEFAULT '',
        nickname TEXT NOT NULL DEFAULT '',
        joined_at TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'participant',
        last_seen TEXT NOT NULL,
        edits_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE(session_id, user_id),
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_participants_user ON participants(user_id)`)

    database.exec(`
      CREATE TABLE IF NOT EXISTS code_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        code TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '',
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL DEFAULT '',
        change_description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE(session_id, version),
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_code_snapshots_session ON code_snapshots(session_id, version DESC)`)

    database.exec(`
      CREATE TABLE IF NOT EXISTS run_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        language TEXT NOT NULL DEFAULT '',
        output TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT '',
        duration_ms INTEGER NOT NULL DEFAULT 0,
        exit_code INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_run_history_session ON run_history(session_id)`)
  }

  // ── Session Management ─────────────────────────────────────────────────────

  function createSession(config, params) {
    ensure(config)
    const maxSessions = configInt(config, "maxSessions", DEFAULT_MAX_SESSIONS)
    const activeCount = Object.values(sessions).filter(s => s.status === "active").length
    if (activeCount >= maxSessions) {
      return { error: `Maximum sessions (${maxSessions}) reached. End an existing session first.` }
    }

    const sessionId = makeId("session")
    const now = nowISO()
    const ownerId = params.ownerId || ""
    const ownerName = params.ownerName || "Unknown"
    const guildId = params.guildId || ""
    const channelId = params.channelId || ""
    const language = normalizeLanguage(params.language)
    const title = trimText(params.title) || `Code Session ${sessionId.slice(0, 8)}`

    database.exec(
      `INSERT INTO sessions (id, title, language, owner_id, owner_name, guild_id, channel_id, thread_id, message_id, locked_by, created_at, updated_at, last_activity, status, code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      sessionId, title, language, ownerId, ownerName, guildId, channelId, "", "", ownerId, now, now, now, "active", ""
    )

    const session = getSession(sessionId)
    if (session) {
      sessions[sessionId] = session
    }

    // Auto-join owner
    addParticipant(sessionId, {
      userId: ownerId,
      username: ownerName,
      nickname: params.nickname || ownerName,
      role: "owner",
    })

    // Initialize snapshots
    codeSnapshots[sessionId] = []

    return { session }
  }

  function getSession(sessionId) {
    const row = database.querySingle(`SELECT * FROM sessions WHERE id = ?`, sessionId)
    return row ? decodeSession(row) : null
  }

  function getSessionsByGuild(guildId) {
    const rows = database.query(`SELECT * FROM sessions WHERE guild_id = ? AND status = 'active' ORDER BY last_activity DESC`, guildId)
    return rows.map(decodeSession)
  }

  function getActiveSessions(config) {
    ensure(config)
    const rows = database.query(`SELECT * FROM sessions WHERE status = 'active' ORDER BY last_activity DESC`)
    return rows.map(decodeSession)
  }

  function updateSession(sessionId, patch) {
    const session = getSession(sessionId)
    if (!session) return null

    const updated = {
      ...session,
      ...patch,
      id: session.id,
      updated_at: nowISO(),
      last_activity: nowISO(),
    }

    database.exec(
      `UPDATE sessions SET title = ?, language = ?, locked_by = ?, locked_at = ?, updated_at = ?, last_activity = ?, status = ?, code = ? WHERE id = ?`,
      updated.title, updated.language, updated.locked_by, updated.locked_at, updated.updated_at, updated.last_activity, updated.status, updated.code, sessionId
    )

    if (sessions[sessionId]) {
      sessions[sessionId] = updated
    }

    return getSession(sessionId)
  }

  function endSession(sessionId) {
    const session = getSession(sessionId)
    if (!session) return null

    // Remove all participants
    database.exec(`DELETE FROM participants WHERE session_id = ?`, sessionId)
    delete participants[sessionId]
    delete codeSnapshots[sessionId]

    // Mark session as ended
    const now = nowISO()
    database.exec(`UPDATE sessions SET status = 'ended', updated_at = ?, last_activity = ? WHERE id = ?`, now, now, sessionId)

    delete sessions[sessionId]
    return { ...session, status: "ended" }
  }

  function touchSession(sessionId) {
    database.exec(`UPDATE sessions SET last_activity = ? WHERE id = ?`, nowISO(), sessionId)
    if (sessions[sessionId]) {
      sessions[sessionId].last_activity = nowISO()
    }
  }

  // ── Participant Management ──────────────────────────────────────────────────

  function addParticipant(sessionId, info) {
    const userId = info.userId || ""
    const username = info.username || "Unknown"
    const nickname = info.nickname || username
    const role = info.role || "participant"
    const now = nowISO()

    database.exec(
      `INSERT OR REPLACE INTO participants (session_id, user_id, username, nickname, joined_at, role, last_seen, edits_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      sessionId, userId, username, nickname, now, role, now, 0
    )

    if (!participants[sessionId]) {
      participants[sessionId] = {}
    }
    participants[sessionId][userId] = {
      session_id: sessionId,
      user_id: userId,
      username: username,
      nickname: nickname,
      joined_at: now,
      role: role,
      last_seen: now,
      edits_count: 0,
    }

    return participants[sessionId][userId]
  }

  function removeParticipant(sessionId, userId) {
    database.exec(`DELETE FROM participants WHERE session_id = ? AND user_id = ?`, sessionId, userId)
    if (participants[sessionId]) {
      delete participants[sessionId][userId]
    }
  }

  function getParticipants(sessionId) {
    const rows = database.query(`SELECT * FROM participants WHERE session_id = ? ORDER BY joined_at`, sessionId)
    return rows.map(decodeParticipant)
  }

  function getParticipant(sessionId, userId) {
    const row = database.querySingle(`SELECT * FROM participants WHERE session_id = ? AND user_id = ?`, sessionId, userId)
    return row ? decodeParticipant(row) : null
  }

  function getUserSessions(userId) {
    const rows = database.query(`SELECT s.* FROM sessions s JOIN participants p ON s.id = p.session_id WHERE p.user_id = ? AND s.status = 'active' ORDER BY s.last_activity DESC`, userId)
    return rows.map(decodeSession)
  }

  function isParticipant(sessionId, userId) {
    const row = database.querySingle(`SELECT 1 FROM participants WHERE session_id = ? AND user_id = ?`, sessionId, userId)
    return !!row
  }

  function updateParticipantRole(sessionId, userId, role) {
    database.exec(`UPDATE participants SET role = ? WHERE session_id = ? AND user_id = ?`, role, sessionId, userId)
    if (participants[sessionId] && participants[sessionId][userId]) {
      participants[sessionId][userId].role = role
    }
  }

  function incrementEdits(sessionId, userId) {
    database.exec(`UPDATE participants SET edits_count = edits_count + 1, last_seen = ? WHERE session_id = ? AND user_id = ?`, nowISO(), sessionId, userId)
    if (participants[sessionId] && participants[sessionId][userId]) {
      participants[sessionId][userId].edits_count++
      participants[sessionId][userId].last_seen = nowISO()
    }
  }

  // ── Code Snapshots ─────────────────────────────────────────────────────────

  function saveCodeSnapshot(sessionId, params) {
    const session = getSession(sessionId)
    if (!session) return null

    const version = getNextVersion(sessionId)
    const now = nowISO()
    const language = params.language || session.language || ""
    const code = params.code || ""
    const authorId = params.authorId || ""
    const authorName = params.authorName || "Unknown"
    const description = params.description || ""

    database.exec(
      `INSERT INTO code_snapshots (session_id, version, code, language, author_id, author_name, change_description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      sessionId, version, code, language, authorId, authorName, description, now
    )

    // Update session's current code
    updateSession(sessionId, { code, language })

    // Initialize snapshots array if needed
    if (!codeSnapshots[sessionId]) {
      codeSnapshots[sessionId] = []
    }

    const snapshot = {
      id: `${sessionId}_v${version}`,
      session_id: sessionId,
      version,
      code,
      language,
      author_id: authorId,
      author_name: authorName,
      change_description: description,
      created_at: now,
    }

    codeSnapshots[sessionId].push(snapshot)
    incrementEdits(sessionId, authorId)

    return snapshot
  }

  function getCodeSnapshot(sessionId, version) {
    const row = database.querySingle(`SELECT * FROM code_snapshots WHERE session_id = ? AND version = ?`, sessionId, version)
    return row ? decodeSnapshot(row) : null
  }

  function getCodeHistory(sessionId, limit = 50) {
    const rows = database.query(`SELECT * FROM code_snapshots WHERE session_id = ? ORDER BY version DESC LIMIT ?`, sessionId, Math.min(limit, 100))
    return rows.map(decodeSnapshot)
  }

  function getNextVersion(sessionId) {
    const row = database.querySingle(`SELECT MAX(version) as max_version FROM code_snapshots WHERE session_id = ?`, sessionId)
    return Number(row && row.max_version || 0) + 1
  }

  // ── Run History ─────────────────────────────────────────────────────────────

  function saveRunResult(sessionId, params) {
    const version = params.version || getNextVersion(sessionId)
    database.exec(
      `INSERT INTO run_history (session_id, version, language, output, error, duration_ms, exit_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      sessionId, version, params.language || "", params.output || "", params.error || "", params.durationMs || 0, params.exitCode || 0, nowISO()
    )
  }

  function getRunHistory(sessionId, limit = 10) {
    const rows = database.query(`SELECT * FROM run_history WHERE session_id = ? ORDER BY id DESC LIMIT ?`, sessionId, Math.min(limit, 50))
    return rows.map(decodeRunResult)
  }

  // ── Session Locking ─────────────────────────────────────────────────────────

  function toggleLock(sessionId, userId) {
    const session = getSession(sessionId)
    if (!session) return null

    if (session.locked_by && session.locked_by !== userId) {
      return { error: `Session is locked by <@${session.locked_by}>. Wait for them to unlock it.` }
    }

    if (session.locked_by === userId) {
      // Unlock
      return updateSession(sessionId, { locked_by: "", locked_at: null })
    } else {
      // Lock
      return updateSession(sessionId, { locked_by: userId, locked_at: nowISO() })
    }
  }

  function canEdit(sessionId, userId) {
    const session = getSession(sessionId)
    if (!session) return false
    if (!session.locked_by) return true // Not locked, anyone can edit
    return session.locked_by === userId
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function decodeSession(row) {
    return {
      id: trimText(row.id),
      title: trimText(row.title),
      language: trimText(row.language),
      owner_id: trimText(row.owner_id),
      owner_name: trimText(row.owner_name),
      guild_id: trimText(row.guild_id),
      channel_id: trimText(row.channel_id),
      thread_id: trimText(row.thread_id),
      message_id: trimText(row.message_id),
      locked_by: trimText(row.locked_by),
      locked_at: trimText(row.locked_at),
      created_at: trimText(row.created_at),
      updated_at: trimText(row.updated_at),
      last_activity: trimText(row.last_activity),
      status: trimText(row.status),
      code: trimText(row.code),
    }
  }

  function decodeParticipant(row) {
    return {
      session_id: trimText(row.session_id),
      user_id: trimText(row.user_id),
      username: trimText(row.username),
      nickname: trimText(row.nickname),
      joined_at: trimText(row.joined_at),
      role: trimText(row.role),
      last_seen: trimText(row.last_seen),
      edits_count: Number(row.edits_count || 0),
    }
  }

  function decodeSnapshot(row) {
    return {
      id: Number(row.id || 0),
      session_id: trimText(row.session_id),
      version: Number(row.version || 0),
      code: trimText(row.code),
      language: trimText(row.language),
      author_id: trimText(row.author_id),
      author_name: trimText(row.author_name),
      change_description: trimText(row.change_description),
      created_at: trimText(row.created_at),
    }
  }

  function decodeRunResult(row) {
    return {
      id: Number(row.id || 0),
      session_id: trimText(row.session_id),
      version: Number(row.version || 0),
      language: trimText(row.language),
      output: trimText(row.output),
      error: trimText(row.error),
      duration_ms: Number(row.duration_ms || 0),
      exit_code: Number(row.exit_code || 0),
      created_at: trimText(row.created_at),
    }
  }

  function normalizeLanguage(lang) {
    const text = trimText(lang || "").toLowerCase()
    const aliases = {
      js: "javascript", ts: "typescript",
      py: "python", rb: "ruby",
      go: "go", rs: "rust",
      rs: "rust", c: "c", cpp: "cpp",
      java: "java", cs: "csharp",
      sh: "bash", shell: "bash",
      sql: "sql", css: "css",
      html: "html", json: "json",
      yml: "yaml", md: "markdown",
    }
    return aliases[text] || text || "text"
  }

  function configInt(config, key, fallback) {
    const val = config && config[key]
    const n = Number(val)
    return Number.isFinite(n) ? Math.floor(n) : fallback
  }

  return {
    ensure,
    configPath: () => configuredPath,
    createSession,
    getSession,
    getSessionsByGuild,
    getActiveSessions,
    updateSession,
    endSession,
    touchSession,
    addParticipant,
    removeParticipant,
    getParticipants,
    getParticipant,
    getUserSessions,
    isParticipant,
    updateParticipantRole,
    incrementEdits,
    saveCodeSnapshot,
    getCodeSnapshot,
    getCodeHistory,
    getNextVersion,
    saveRunResult,
    getRunHistory,
    toggleLock,
    canEdit,
  }
}

function configValue(config, names, fallback) {
  for (const name of names || []) {
    if (!name) continue
    if (config && Object.prototype.hasOwnProperty.call(config, name) && config[name] !== undefined && config[name] !== null && String(config[name]).trim() !== "") {
      return config[name]
    }
  }
  return fallback
}

function trimText(value) {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

function nowISO() {
  return new Date().toISOString()
}

function makeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

module.exports = { createCodeSessionStore, DEFAULT_SESSION_TTL, DEFAULT_MAX_PARTICIPANTS, DEFAULT_MAX_SESSIONS }
