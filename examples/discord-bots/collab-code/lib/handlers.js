const ui = require("./ui")
const { renderSessionCard, renderParticipantList, renderCodeBlock, renderVersionHistory } = require("./render")

// ── Session State Flows ─────────────────────────────────────────────────────

const sessionFlow = ui.flow("collab.session", {
  init: { sessionId: "", page: 1 },
})

const versionFlow = ui.flow("collab.version", {
  init: { sessionId: "", version: 0, page: 1 },
})

const listFlow = ui.flow("collab.list", {
  init: { page: 1, selectedSessionId: "" },
})

// ── Session Commands ─────────────────────────────────────────────────────────

const handleSessionCommands = {
  // /collab start
  startSession(ctx, store) {
    store.ensure(ctx.config)
    const userId = actorId(ctx)
    const username = userName(ctx)
    const guildId = String((ctx.guild && ctx.guild.id) || "").trim()
    const channelId = String((ctx.channel && ctx.channel.id) || "").trim()

    // Check if user is already in a session
    const existing = store.getUserSessions(userId)
    if (existing.length > 0) {
      return ui.error(`You're already in a session: **${existing[0].title}** (${existing[0].id}). Use /collab leave first.`)
    }

    const title = String((ctx.args || {}).title || "").trim()
    const language = String((ctx.args || {}).language || "").trim()
    const createThread = Boolean((ctx.args || {}).thread)

    const result = store.createSession(ctx.config, {
      ownerId: userId,
      ownerName: username,
      guildId,
      channelId,
      title,
      language,
    })

    if (result.error) {
      return ui.error(result.error)
    }

    const session = result.session
    const maxParticipants = configInt(ctx.config, "maxParticipants", 10)

    // Save session flow state
    sessionFlow.save(ctx, { sessionId: session.id, page: 1 })

    return renderStartScreen(ctx, session, username, maxParticipants)
  },

  // /collab join
  joinSession(ctx, store) {
    store.ensure(ctx.config)
    const userId = actorId(ctx)
    const username = userName(ctx)
    const guildId = String((ctx.guild && ctx.guild.id) || "").trim()
    const channelId = String((ctx.channel && ctx.channel.id) || "").trim()
    const requestedId = String((ctx.args || {}).session_id || "").trim()

    // Check if user is already in a session
    const existing = store.getUserSessions(userId)
    if (existing.length > 0) {
      return ui.error(`You're already in a session: **${existing[0].title}** (${existing[0].id}). Use /collab leave first.`)
    }

    let session = null
    if (requestedId) {
      session = store.getSession(requestedId)
    } else {
      // Find the first active session in this guild
      const sessions = store.getSessionsByGuild(guildId)
      session = sessions.length > 0 ? sessions[0] : null
    }

    if (!session) {
      return ui.error("No active session found. Use /collab start to create one, or specify a session ID.")
    }

    if (session.status !== "active") {
      return ui.error(`Session **${session.title}** is ${session.status}.`)
    }

    const maxParticipants = configInt(ctx.config, "maxParticipants", 10)
    const participants = store.getParticipants(session.id)
    if (participants.length >= maxParticipants) {
      return ui.error(`Session **${session.title}** is full (${maxParticipants} max participants).`)
    }

    store.addParticipant(session.id, {
      userId,
      username,
      nickname: userName(ctx),
      role: "participant",
    })

    sessionFlow.save(ctx, { sessionId: session.id, page: 1 })

    return renderSessionScreen(ctx, session, store, maxParticipants)
  },

  // Join from message button
  async joinSessionFromMessage(ctx, store) {
    const messageId = ctx.message && ctx.message.id
    if (!messageId) {
      return ui.error("Could not identify the session from this message.")
    }
    // Extract session info from message content
    const state = listFlow.load(ctx)
    if (state.selectedSessionId) {
      const session = store.getSession(state.selectedSessionId)
      if (session) {
        sessionFlow.save(ctx, { sessionId: session.id, page: 1 })
        const userId = actorId(ctx)
        const username = userName(ctx)
        store.addParticipant(session.id, {
          userId,
          username,
          nickname: userName(ctx),
          role: "participant",
        })
        const maxParticipants = configInt(ctx.config, "maxParticipants", 10)
        return renderSessionScreen(ctx, session, store, maxParticipants)
      }
    }
    return ui.error("No session selected. Use /collab list first.")
  },

  // /collab leave
  leaveSession(ctx, store) {
    store.ensure(ctx.config)
    const userId = actorId(ctx)
    const username = userName(ctx)

    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) {
      return ui.error("You're not in a session. Use /collab start or /collab join first.")
    }

    const session = store.getSession(sessionId)
    if (!session) {
      sessionFlow.clear(ctx)
      return ui.error("Session not found. It may have ended.")
    }

    if (session.owner_id === userId) {
      return ui.confirm("collab:end-session-confirm", "collab:cancel-end-session", {
        title: "End session?",
        body: `**${session.title}** is your session. Leaving will end it for everyone. Confirm to end it, or cancel to stay.`,
        confirmLabel: "End session",
        cancelLabel: "Stay",
        confirmStyle: "danger",
      })
    }

    store.removeParticipant(sessionId, userId)
    sessionFlow.clear(ctx)

    return ui.message()
      .ephemeral()
      .content(`${username} left **${session.title}**.`)
      .embed(ui.embed("Left session").color(0x95A5A6).description(`You left **${session.title}**. The session is still active for other participants.`).build())
      .build()
  },

  // /collab end
  endSession(ctx, store) {
    store.ensure(ctx.config)
    const userId = actorId(ctx)
    const username = userName(ctx)

    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) {
      return ui.error("You're not in a session. Use /collab start or /collab join first.")
    }

    const session = store.getSession(sessionId)
    if (!session) {
      sessionFlow.clear(ctx)
      return ui.error("Session not found. It may have already ended.")
    }

    if (session.owner_id !== userId) {
      return ui.error("Only the session owner can end the session.")
    }

    store.endSession(sessionId)
    sessionFlow.clear(ctx)

    return ui.message()
      .ephemeral()
      .content(`**${session.title}** has been ended by ${username}.`)
      .embed(ui.embed("Session ended").color(0xED4245).description(`Session **${session.title}** has been closed. All participants have been removed.`).build())
      .build()
  },

  // /collab list
  listSessions(ctx, store) {
    store.ensure(ctx.config)
    const guildId = String((ctx.guild && ctx.guild.id) || "").trim()

    const sessions = guildId
      ? store.getSessionsByGuild(guildId)
      : store.getActiveSessions(ctx.config)

    if (sessions.length === 0) {
      return ui.emptyResults("active code sessions")
    }

    const state = listFlow.save(ctx, { page: 1, selectedSessionId: sessions[0] ? sessions[0].id : "" })
    return renderSessionListScreen(ctx, sessions, state)
  },

  selectSession(ctx, store, sessionId) {
    const session = store.getSession(sessionId)
    if (!session) {
      return ui.error(`Session not found: ${sessionId}`)
    }
    listFlow.save(ctx, { selectedSessionId: sessionId })
    sessionFlow.save(ctx, { sessionId: session.id, page: 1 })
    const maxParticipants = configInt(ctx.config, "maxParticipants", 10)
    return renderSessionScreen(ctx, session, store, maxParticipants)
  },

  // /collab status
  sessionStatus(ctx, store) {
    store.ensure(ctx.config)
    const userId = actorId(ctx)
    const requestedId = String((ctx.args || {}).session_id || "").trim()

    const state = sessionFlow.load(ctx)
    const sessionId = requestedId || state.sessionId
    if (!sessionId) {
      // Show all sessions user is in
      const sessions = store.getUserSessions(userId)
      if (sessions.length === 0) {
        return ui.error("You're not in a session. Use /collab start or /collab join first.")
      }
      return renderUserSessionsStatus(ctx, sessions, store)
    }

    const session = store.getSession(sessionId)
    if (!session) {
      return ui.error(`Session not found: ${sessionId}`)
    }

    const maxParticipants = configInt(ctx.config, "maxParticipants", 10)
    return renderSessionScreen(ctx, session, store, maxParticipants)
  },

  // /collab code
  submitCode(ctx, store) {
    store.ensure(ctx.config)
    const userId = actorId(ctx)
    const username = userName(ctx)

    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) {
      return ui.error("You're not in a session. Use /collab start or /collab join first.")
    }

    const session = store.getSession(sessionId)
    if (!session) {
      return ui.error("Session not found.")
    }

    if (!store.canEdit(sessionId, userId)) {
      return ui.error(`Session is locked by <@${session.locked_by}>. Wait for them to unlock it.`)
    }

    const code = String((ctx.args || {}).code || "").trim()
    if (!code) {
      return ui.error("No code provided.")
    }

    const language = String((ctx.args || {}).language || "").trim()

    const snapshot = store.saveCodeSnapshot(sessionId, {
      code,
      language: language || session.language,
      authorId: userId,
      authorName: username,
      description: "Code submitted",
    })

    if (!snapshot) {
      return ui.error("Could not save code snapshot.")
    }

    const maxParticipants = configInt(ctx.config, "maxParticipants", 10)
    return renderCodeSubmissionScreen(ctx, session, snapshot, store, maxParticipants)
  },

  // /collab run
  async runCode(ctx, store) {
    store.ensure(ctx.config)
    const userId = actorId(ctx)
    const username = userName(ctx)

    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) {
      return ui.error("You're not in a session. Use /collab start or /collab join first.")
    }

    const session = store.getSession(sessionId)
    if (!session) {
      return ui.error("Session not found.")
    }

    if (!session.code) {
      return ui.error("No code to run. Use /collab code first.")
    }

    await ctx.defer({ ephemeral: true })

    // Simulate code execution (safe sandbox)
    const result = simulateRun(session.language || session.code_language || "text", session.code)

    store.saveRunResult(sessionId, {
      version: store.getNextVersion(sessionId),
      language: session.language,
      output: result.output,
      error: result.error,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
    })

    await ctx.edit({
      content: `**Run result** (${session.language || "text"}, ${result.durationMs}ms):`,
      embeds: [
        ui.embed("Execution result")
          .color(result.exitCode === 0 ? 0x57F287 : 0xED4245)
          .description(result.output || result.error || "(no output)")
          .field("Exit code", String(result.exitCode), true)
          .field("Duration", `${result.durationMs}ms`, true)
          .build(),
      ],
    })
  },

  // /collab version
  viewVersionHistory(ctx, store) {
    store.ensure(ctx.config)
    const userId = actorId(ctx)

    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) {
      return ui.error("You're not in a session.")
    }

    const session = store.getSession(sessionId)
    if (!session) {
      return ui.error("Session not found.")
    }

    const history = store.getCodeHistory(sessionId, 50)
    if (history.length === 0) {
      return ui.message()
        .ephemeral()
        .content(`No version history for **${session.title}** yet.`)
        .build()
    }

    versionFlow.save(ctx, { sessionId, version: history[0].version, page: 1 })

    return renderVersionHistoryScreen(ctx, session, history, versionFlow.load(ctx))
  },

  navigateVersion(ctx, store, direction) {
    const state = versionFlow.load(ctx)
    const history = store.getCodeHistory(state.sessionId, 50)
    const currentVersion = state.version || history[0] && history[0].version || 0
    const newVersion = direction > 0
      ? Math.min(currentVersion + 1, history.length > 0 ? history[0].version : currentVersion)
      : Math.max(currentVersion - 1, history.length > 0 ? history[history.length - 1].version : currentVersion)

    const snapshot = store.getCodeSnapshot(state.sessionId, newVersion)
    if (!snapshot) {
      return ui.error(`Version ${newVersion} not found.`)
    }

    versionFlow.save(ctx, { ...state, version: newVersion })
    const session = store.getSession(state.sessionId)
    return renderVersionHistoryScreen(ctx, session, history, { ...state, version: newVersion })
  },

  // /collab undo
  undoLastChange(ctx, store) {
    store.ensure(ctx.config)
    const userId = actorId(ctx)

    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) {
      return ui.error("You're not in a session.")
    }

    const session = store.getSession(sessionId)
    if (!session) {
      return ui.error("Session not found.")
    }

    const history = store.getCodeHistory(sessionId, 2)
    if (history.length < 2) {
      return ui.error("No previous version to restore.")
    }

    const previous = history[1] // Second-to-last is the one before current
    store.saveCodeSnapshot(sessionId, {
      code: previous.code,
      language: previous.language,
      authorId: userId,
      authorName: userName(ctx),
      description: `Reverted to version ${previous.version}`,
    })

    return ui.message()
      .ephemeral()
      .content(`Reverted to version **${previous.version}**.`)
      .embed(
        ui.embed(`Version ${previous.version}`)
          .color(0xFEE75C)
          .description(`Code restored to version ${previous.version} by ${previous.author_name}.`)
          .field("Author", previous.author_name, true)
          .field("Language", previous.language || "text", true)
          .build()
      )
      .build()
  },

  // /collab lock
  toggleLock(ctx, store) {
    store.ensure(ctx.config)
    const userId = actorId(ctx)
    const username = userName(ctx)

    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) {
      return ui.error("You're not in a session.")
    }

    const result = store.toggleLock(sessionId, userId)
    if (result && result.error) {
      return ui.error(result.error)
    }

    const session = result || {}
    if (session.locked_by) {
      return ui.message()
        .ephemeral()
        .content(`Session locked by ${username}. Only they can edit until unlocked.`)
        .embed(ui.embed("Session locked").color(0xFEE75C).description(`Session is now locked to <@${session.locked_by}>.`).build())
        .build()
    } else {
      return ui.message()
        .ephemeral()
        .content("Session unlocked. Anyone can now edit.")
        .embed(ui.embed("Session unlocked").color(0x57F287).description("Session is now open for everyone to edit.").build())
        .build()
    }
  },

  // /collab promote
  promoteModerator(ctx, store) {
    store.ensure(ctx.config)
    const userId = actorId(ctx)

    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) {
      return ui.error("You're not in a session.")
    }

    const session = store.getSession(sessionId)
    if (!session || session.owner_id !== userId) {
      return ui.error("Only the session owner can promote moderators.")
    }

    const targetId = String((ctx.args && ctx.args.user && ctx.args.user.id) || (ctx.values && ctx.values.user && ctx.values.user.id) || "").trim()
    if (!targetId) {
      return ui.error("No user specified to promote.")
    }

    if (targetId === session.owner_id) {
      return ui.error("The owner is already the highest role.")
    }

    store.updateParticipantRole(sessionId, targetId, "moderator")
    const maxParticipants = configInt(ctx.config, "maxParticipants", 10)
    return renderSessionScreen(ctx, store.getSession(sessionId), store, maxParticipants)
  },

  // /collab kick
  kickUser(ctx, store) {
    store.ensure(ctx.config)
    const userId = actorId(ctx)

    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) {
      return ui.error("You're not in a session.")
    }

    const session = store.getSession(sessionId)
    if (!session || (session.owner_id !== userId)) {
      const participant = store.getParticipant(sessionId, userId)
      if (!participant || participant.role !== "moderator") {
        return ui.error("Only the session owner or a moderator can kick users.")
      }
    }

    const targetId = String((ctx.args && ctx.args.user && ctx.args.user.id) || (ctx.values && ctx.values.user && ctx.values.user.id) || "").trim()
    if (!targetId) {
      return ui.error("No user specified to kick.")
    }

    if (targetId === session.owner_id) {
      return ui.error("Cannot kick the session owner.")
    }

    store.removeParticipant(sessionId, targetId)
    const maxParticipants = configInt(ctx.config, "maxParticipants", 10)
    return renderSessionScreen(ctx, store.getSession(sessionId), store, maxParticipants)
  },

  // Show code submission form
  showCodeSubmissionForm(ctx, store) {
    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) {
      return ui.error("You're not in a session.")
    }

    const session = store.getSession(sessionId)
    if (!session) {
      return ui.error("Session not found.")
    }

    ctx.showModal({
      customId: sessionFlow.id("submit_code"),
      title: `Submit code — ${session.title}`,
      components: [
        {
          type: "actionRow",
          components: [
            {
              type: "textInput",
              customId: "language",
              label: "Language",
              style: "short",
              required: false,
              value: session.language || "javascript",
            },
          ],
        },
        {
          type: "actionRow",
          components: [
            {
              type: "textInput",
              customId: "code",
              label: "Code",
              style: "paragraph",
              required: true,
              value: session.code || "",
              maxLength: 4000,
            },
          ],
        },
      ],
    })
  },

  // Show participants list
  showParticipants(ctx, store) {
    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) {
      return ui.error("You're not in a session.")
    }

    const session = store.getSession(sessionId)
    if (!session) {
      return ui.error("Session not found.")
    }

    const participants = store.getParticipants(sessionId)
    const sorted = [...participants].sort((a, b) => {
      const rank = { owner: 0, moderator: 1, participant: 2 }
      return (rank[a.role] || 3) - (rank[b.role] || 3)
    })

    const lines = sorted.map((p) => {
      const roleIcon = p.role === "owner" ? "👑" : p.role === "moderator" ? "⚡" : "•"
      const editTag = p.edits_count > 0 ? ` (${p.edits_count} edits)` : ""
      return `${roleIcon} <@${p.user_id}> — ${p.nickname || p.username}${editTag}`
    })

    return ui.message()
      .ephemeral()
      .content(`**${participants.length}** participant${participants.length === 1 ? "" : "s"} in **${session.title}**:`)
      .embed(ui.embed("Participants").color(0x5865F2).description(lines.join("\n") || "No participants.").build())
      .row(
        ui.button(sessionFlow.id("promote"), "Promote user", "secondary"),
        ui.button(sessionFlow.id("kick"), "Kick user", "danger"),
        ui.button(sessionFlow.id("back_to_session"), "Back", "secondary"),
      )
      .build()
  },

  // Handle session select menu
  handleSessionSelect(ctx, store) {
    const selectedValue = extractValue(ctx.values)
    if (!selectedValue) {
      return ui.error("No action selected.")
    }

    switch (selectedValue) {
      case "submit":
        return handleSessionCommands.showCodeSubmissionForm(ctx, store)
      case "run":
        return handleSessionCommands.runCode(ctx, store)
      case "versions":
        return handleSessionCommands.viewVersionHistory(ctx, store)
      case "undo":
        return handleSessionCommands.undoLastChange(ctx, store)
      case "lock":
        return handleSessionCommands.toggleLock(ctx, store)
      default:
        return ui.error(`Unknown action: ${selectedValue}`)
    }
  },

  // Select session from list
  selectSessionFromList(ctx, store) {
    const selectedId = extractValue(ctx.values)
    if (!selectedId) {
      return ui.error("No session selected.")
    }
    const state = listFlow.load(ctx)
    listFlow.save(ctx, { ...state, selectedSessionId: selectedId })
    const session = store.getSession(selectedId)
    if (!session) {
      return ui.error("Session not found.")
    }
    const sessions = store.getSessionsByGuild(String((ctx.guild && ctx.guild.id) || "").trim())
    return renderSessionListScreen(ctx, sessions, { ...state, selectedSessionId: selectedId })
  },


  // View selected session from list
  viewSelectedSession(ctx, store) {
    const state = listFlow.load(ctx)
    const sessionId = state.selectedSessionId
    if (!sessionId) {
      return ui.error("No session selected. Use /collab list first.")
    }
    const session = store.getSession(sessionId)
    if (!session) {
      return ui.error("Session not found.")
    }
    sessionFlow.save(ctx, { sessionId: session.id, page: 1 })
    const maxParticipants = configInt(ctx.config, "maxParticipants", 10)
    return renderSessionScreen(ctx, session, store, maxParticipants)
  },


  // Join selected session from list
  joinSelectedSession(ctx, store) {
    const state = listFlow.load(ctx)
    const sessionId = state.selectedSessionId
    if (!sessionId) {
      return ui.error("No session selected. Use /collab list first.")
    }

    store.ensure(ctx.config)
    const userId = actorId(ctx)
    const username = userName(ctx)

    const existing = store.getUserSessions(userId)
    if (existing.length > 0) {
      return ui.error(`You're already in a session: **${existing[0].title}**. Use /collab leave first.`)
    }

    const session = store.getSession(sessionId)
    if (!session) {
      return ui.error("Session not found.")
    }

    if (session.status !== "active") {
      return ui.error(`Session **${session.title}** is ${session.status}.`)
    }

    store.addParticipant(sessionId, {
      userId,
      username,
      nickname: userName(ctx),
      role: "participant",
    })

    sessionFlow.save(ctx, { sessionId: session.id, page: 1 })
    const maxParticipants = configInt(ctx.config, "maxParticipants", 10)
    return renderSessionScreen(ctx, session, store, maxParticipants)
  },


  // Navigate list
  listNavigate(ctx, store, direction) {
    const state = listFlow.load(ctx)
    const guildId = String((ctx.guild && ctx.guild.id) || "").trim()
    const sessions = guildId ? store.getSessionsByGuild(guildId) : store.getActiveSessions(ctx.config)
    const page = Number(state.page || 1)
    const pageSize = 5
    const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize))
    const newPage = Math.max(1, Math.min(page + direction, totalPages))
    listFlow.save(ctx, { ...state, page: newPage })
    return renderSessionListScreen(ctx, sessions, { ...state, page: newPage })
  },

  // Revert to a version
  revertToVersion(ctx, store) {
    const state = versionFlow.load(ctx)
    const snapshot = store.getCodeSnapshot(state.sessionId, state.version)
    if (!snapshot) {
      return ui.error(`Version ${state.version} not found.`)
    }

    const userId = actorId(ctx)
    store.saveCodeSnapshot(state.sessionId, {
      code: snapshot.code,
      language: snapshot.language,
      authorId: userId,
      authorName: userName(ctx),
      description: `Reverted to version ${snapshot.version}`,
    })


    return ui.message()
      .ephemeral()
      .content(`Reverted to version **${snapshot.version}**.`)
      .embed(
        ui.embed(`Version ${snapshot.version}`)
          .color(0x57F287)
          .description(`Code restored to version ${snapshot.version}.`)
          .field("Author", snapshot.author_name, true)
          .field("Language", snapshot.language || "text", true)
          .build()
      )
      .build()
  },


  // Use version as current code
  useVersionAsCode(ctx, store) {
    const state = versionFlow.load(ctx)
    const snapshot = store.getCodeSnapshot(state.sessionId, state.version)
    if (!snapshot) {
      return ui.error(`Version ${state.version} not found.`)
    }

    const userId = actorId(ctx)
    store.saveCodeSnapshot(state.sessionId, {
      code: snapshot.code,
      language: snapshot.language,
      authorId: userId,
      authorName: userName(ctx),
      description: `Copied from version ${snapshot.version}`,
    })


    return handleSessionCommands.sessionStatus(ctx, store)
  },

  // Language selector
  setLanguage(ctx, store) {
    store.ensure(ctx.config)
    const lang = extractValue(ctx.values)
    if (!lang) {
      return ui.error("No language selected.")
    }

    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) {
      return ui.error("You're not in a session.")
    }

    const normalized = normalizeLanguage(lang)
    store.updateSession(sessionId, { language: normalized })
    const session = store.getSession(sessionId)
    const maxParticipants = configInt(ctx.config, "maxParticipants", 10)
    return renderSessionScreen(ctx, session, store, maxParticipants)
  },
}

// ── Message Handlers ─────────────────────────────────────────────────────────

const handleMessage = {
  messageCreate(ctx, store) {
    const state = sessionFlow.load(ctx)
    const sessionId = state.sessionId
    if (!sessionId) return // Not in a session

    const content = String((ctx.message && ctx.message.content) || "").trim()
    const userId = actorId(ctx)
    const channelId = String((ctx.channel && ctx.channel.id) || "").trim()

    // Quick code submission via message
    if (content.startsWith("```") && content.endsWith("```")) {
      if (!store.canEdit(sessionId, userId)) {
        return // Locked, silently ignore
      }

      const code = content.slice(3, -3).trim()
      const language = extractLanguage(content)
      store.saveCodeSnapshot(sessionId, {
        code,
        language,
        authorId: userId,
        authorName: userName(ctx),
        description: "Code submitted via message",
      })
    }

    return // Don't respond to regular messages
  },

  messageUpdate(ctx, store) {
    // Handle code block edits
    return
  },

  memberLeft(ctx, store) {
    // Auto-remove from sessions
    const userId = actorId(ctx)
    // This is fired when the bot sees a member leave
    // Check sessions and remove the user
    return
  },
}

const handleReaction = {
  // Reaction-based code promotion (future)
}

function extractValue(values) {
  if (Array.isArray(values) && values.length > 0) {
    return String(values[0] || "").trim()
  }
  if (values && typeof values === "object") {
    const keys = Object.keys(values)
    if (keys.length > 0) {
      return String(values[keys[0]] || "").trim()
    }
  }
  return ""
}

function actorId(ctx) {
  return String((ctx.user && ctx.user.id) || (ctx.member && ctx.member.user && ctx.member.user.id) || "").trim()
}

function userName(ctx) {
  const user = ctx.user || (ctx.member && ctx.member.user) || {}
  return String(user.username || "Unknown").trim()
}

function configInt(config, key, fallback) {
  const val = config && config[key]
  const n = Number(val)
  return Number.isFinite(n) ? Math.floor(n) : fallback
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


// ── Render Screens ──────────────────────────────────────────────────────────

function renderStartScreen(ctx, session, username, maxParticipants) {
  return ui.message()
    .content(`**${session.title}** started by ${username}.`)
    .embed(
      ui.embed(session.title)
        .color(0x57F287)
        .description("A new collaborative code session has begun.")
        .field("Language", session.language || "text", true)
        .field("Version", "1", true)
        .field("Participants", "1", true)
        .field("Max participants", String(maxParticipants), true)
        .footer(`Session ID: ${session.id}`)
    )
    .row(
      ui.button(sessionFlow.id("submit_code"), "Submit code", "primary"),
      ui.button(sessionFlow.id("join"), "View session", "secondary"),
      ui.button(sessionFlow.id("lock"), "Lock session", "secondary"),
      ui.button(sessionFlow.id("end"), "End session", "danger"),
    )
    .build()
}

function renderSessionScreen(ctx, session, store, maxParticipants) {
  const userId = actorId(ctx)
  const participants = store.getParticipants(session.id)
  const history = store.getCodeHistory(session.id, 1)
  const currentSnapshot = history.length > 0 ? history[0] : null
  const locked = session.locked_by && session.locked_by !== ""
  const canEdit = store.canEdit(session.id, userId)

  return ui.message()
    .content(`**${session.title}** — collaborative code session`)
    .embed(
      ui.card(session.title)
        .description(currentSnapshot ? truncateCode(currentSnapshot.code, 200) : "_No code yet. Use /collab code to submit._")
        .color(locked ? 0xFEE75C : 0x5865F2)
        .meta("Language", currentSnapshot ? normalizeLanguage(currentSnapshot.language) : "text", true)
        .meta("Version", currentSnapshot ? String(currentSnapshot.version) : "0", true)
        .meta("Locked", locked ? `by <@${session.locked_by}>` : "No", true)
        .meta("Participants", `${participants.length}/${maxParticipants}`)
        .footer(`Session ID: ${session.id}`)
    )
    .row(
      ui.select(sessionFlow.id("select"))
        .placeholder("Select a session action")
        .option("📝 Submit code", "submit", "Submit new code")
        .option("▶️ Run code", "run", "Execute the current code")
        .option("📜 Version history", "versions", "View change history")
        .option("🔄 Undo last change", "undo", "Revert to previous version")
        .option("🔒 Toggle lock", "lock", "Lock/unlock editing")
    )
    .row(
      ui.button(sessionFlow.id("submit_code"), "Submit code", "primary"),
      ui.button(sessionFlow.id("run"), "Run code", canEdit ? "success" : "secondary"),
      ui.button(sessionFlow.id("versions"), "Versions", "secondary"),
      ui.button(sessionFlow.id("lock"), locked ? "Unlock" : "Lock", locked ? "danger" : "warning"),
    )
    .row(
      ui.button(sessionFlow.id("participants"), `${participants.length} participants`, "secondary"),
      ui.button(sessionFlow.id("leave"), "Leave session", "danger"),
      ui.button(sessionFlow.id("end"), "End session", "danger"),
    )
    .build()
}

function renderCodeSubmissionScreen(ctx, session, snapshot, store, maxParticipants) {
  const participants = store.getParticipants(session.id)

  return ui.message()
    .content(`Code submitted (version **${snapshot.version}**) to **${session.title}**.`)
    .embed(
      ui.card(session.title)
        .description(truncateCode(snapshot.code, 300))
        .color(0x57F287)
        .meta("Language", normalizeLanguage(snapshot.language), true)
        .meta("Version", String(snapshot.version), true)
        .meta("Author", snapshot.author_name, true)
        .meta("Participants", `${participants.length}/${maxParticipants}`)
    )
    .row(
      ui.button(sessionFlow.id("run"), "Run code", "success"),
      ui.button(sessionFlow.id("versions"), "Version history", "secondary"),
      ui.button(sessionFlow.id("submit_code"), "Update code", "primary"),
    )
    .row(
      ui.button(sessionFlow.id("back_to_session"), "Back to session", "secondary"),
    )
    .build()
}

function renderSessionListScreen(ctx, sessions, state) {
  const page = Number(state.page || 1)
  const pageSize = 5
  const pageCount = Math.max(1, Math.ceil(sessions.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * pageSize
  const pageSessions = sessions.slice(start, start + pageSize)

  const selectedId = state.selectedSessionId || (pageSessions[0] && pageSessions[0].id)

  return ui.message()
    .ephemeral()
    .content(`**${sessions.length}** active session${sessions.length === 1 ? "" : "s"}. Select one to view or join.`)
    .embed(
      ui.embed(`Active sessions — Page ${currentPage}/${pageCount}`)
        .color(0x5865F2)
        .description(
          pageSessions.map((s, i) =>
            `**${start + i + 1}.** ${s.title} — ${s.owner_name} · ${s.language || "text"} · v${store.getCodeHistory(s.id, 1).length > 0 ? store.getCodeHistory(s.id, 1)[0].version : 0}`
          ).join("\n") || "No sessions."
        )
        .footer(`Showing ${pageSessions.length} of ${sessions.length} sessions`)
    )
    .row(
      ui.select(listFlow.id("select"))
        .placeholder("Choose a session")
        .optionEntries(pageSessions.map((s) => ({
          id: s.id,
          label: s.title,
          description: `${s.owner_name} · ${s.language || "text"}`,
        })), selectedId)
    )
    .row(
      ui.button(listFlow.id("view"), "View session", "primary"),
      ui.button(listFlow.id("join"), "Join session", "success"),
    )
    .row(ui.pager(listFlow.id("previous"), listFlow.id("next"), {
      hasPrevious: currentPage > 1,
      hasNext: currentPage < pageCount,
    }))
    .build()
}

function renderUserSessionsStatus(ctx, sessions, store) {
  return ui.message()
    .ephemeral()
    .content(`You're in **${sessions.length}** session${sessions.length === 1 ? "" : "s"}.`)
    .embed(
      ui.embed("Your sessions")
        .color(0x5865F2)
        .description(
          sessions.map((s) =>
            `• **${s.title}** (${s.id}) — ${s.language || "text"} — ${store.getParticipants(s.id).length} participants`
          ).join("\n")
        )
    )
    .build()
}

function renderVersionHistoryScreen(ctx, session, history, state) {
  const version = state.version || (history[0] && history[0].version) || 0
  const current = history.find((h) => h.version === version) || history[0]
  if (!current) {
    return ui.error("Version not found.")
  }

  const historyIndex = history.findIndex((h) => h.version === version)
  const hasPrevious = historyIndex < history.length - 1
  const hasNext = historyIndex > 0

  return ui.message()
    .ephemeral()
    .content(`Version history for **${session.title}** — **${history.length}** version${history.length === 1 ? "" : "s"} saved.`)
    .embed(
      ui.card(`Version ${current.version}`)
        .description(truncateCode(current.code, 250))
        .color(0xFEE75C)
        .meta("Language", normalizeLanguage(current.language), true)
        .meta("Author", current.author_name, true)
        .meta("Change", current.change_description || "(no description)", true)
        .footer(`Version ${historyIndex + 1} of ${history.length}`)
    )
    .row(
      ui.button(versionFlow.id("revert"), "Revert to this", "primary"),
      ui.button(versionFlow.id("submit_code"), "Use as code", "secondary"),
    )
    .row(ui.pager(versionFlow.id("previous"), versionFlow.id("next"), {
      hasPrevious,
      hasNext,
    }))
    .build()
}

// ── Simulated Code Execution ───────────────────────────────────────────────

function simulateRun(language, code) {
  const startTime = Date.now()

  // Very basic simulation - just echo the code in a safe way
  const outputLines = code.split("\n").map((line) => `// ${line}`)
  const output = `// Executed ${language} code (simulated)\n${outputLines.slice(0, 20).join("\n")}`
  const durationMs = Math.floor(Math.random() * 100) + (Date.now() - startTime)

  return {
    output: output.slice(0, 1000),
    error: "",
    durationMs,
    exitCode: 0,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function truncateCode(code, maxLen) {
  const trimmed = (code || "").slice(0, maxLen)
  if ((code || "").length > maxLen) {
    return trimmed + "\n..."
  }
  return trimmed
}

function extractLanguage(codeBlock) {
  const match = codeBlock.match(/^```(\w*)/)
  return match && match[1] ? match[1].toLowerCase() : "text"
}

function actorId(ctx) {
  return String((ctx.user && ctx.user.id) || (ctx.member && ctx.member.user && ctx.member.user.id) || "").trim()
}

function userName(ctx) {
  const user = ctx.user || (ctx.member && ctx.member.user) || {}
  return String(user.username || "Unknown").trim()
}

function configInt(config, key, fallback) {
  const val = config && config[key]
  const n = Number(val)
  return Number.isFinite(n) ? Math.floor(n) : fallback
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
  handleSessionCommands,
  handleMessage,
  handleReaction,
}
