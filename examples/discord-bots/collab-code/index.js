const { defineBot } = require("discord")
const { createCodeSessionStore } = require("./lib/store")
const { handleSessionCommands, handleMessage, handleReaction } = require("./lib/handlers")

// In-memory session store
const store = createCodeSessionStore()

module.exports = defineBot(({ command, event, component, modal, configure }) => {
  configure({
    name: "collab-code",
    description: "Collaborative code editing sessions live in Discord threads",
    category: "collaboration",
    run: {
      fields: {
        dbPath: {
          type: "string",
          default: "./examples/discord-bots/collab-code/data/collab-code.sqlite",
          help: "SQLite database path for collaborative code sessions",
        },
        sessionTTL: {
          type: "integer",
          default: 3600,
          help: "Session timeout in seconds (default: 3600)",
        },
        maxParticipants: {
          type: "integer",
          default: 10,
          help: "Maximum participants per session (default: 10)",
        },
        maxSessions: {
          type: "integer",
          default: 5,
          help: "Maximum concurrent sessions (default: 5)",
        },
      },
    },
  })

  event("ready", async (ctx) => {
    ctx.log.info("collab-code bot ready", {
      user: ctx.me && ctx.me.username,
      script: ctx.metadata && ctx.metadata.scriptPath,
    })
  })

  // ── Session Commands ─────────────────────────────────────────────────────

  command("collab-start", {
    description: "Start a collaborative code session",
    options: {
      title: {
        type: "string",
        description: "Session title",
        required: false,
      },
      language: {
        type: "string",
        description: "Programming language (e.g. javascript, python, go)",
        required: false,
      },
      thread: {
        type: "boolean",
        description: "Create a thread for the session",
        required: false,
      },
    },
  }, async (ctx) => {
    return handleSessionCommands.startSession(ctx, store)
  })

  command("collab-join", {
    description: "Join an active collaborative session",
    options: {
      session_id: {
        type: "string",
        description: "Session ID (or leave empty to join the first available)",
        required: false,
      },
    },
  }, async (ctx) => {
    return handleSessionCommands.joinSession(ctx, store)
  })

  command("collab-leave", {
    description: "Leave the current session you're in",
  }, async (ctx) => {
    return handleSessionCommands.leaveSession(ctx, store)
  })

  command("collab-end", {
    description: "End your active collaborative session",
  }, async (ctx) => {
    return handleSessionCommands.endSession(ctx, store)
  })

  command("collab-list", {
    description: "List all active collaborative sessions",
  }, async (ctx) => {
    return handleSessionCommands.listSessions(ctx, store)
  })

  command("collab-status", {
    description: "Show status of a session",
    options: {
      session_id: {
        type: "string",
        description: "Session ID (or leave empty for your current session)",
        required: false,
      },
    },
  }, async (ctx) => {
    return handleSessionCommands.sessionStatus(ctx, store)
  })

  command("collab-code", {
    description: "Submit or update code in a session",
    options: {
      code: {
        type: "string",
        description: "Code to add/update",
        required: true,
      },
      language: {
        type: "string",
        description: "Programming language override",
        required: false,
      },
    },
  }, async (ctx) => {
    return handleSessionCommands.submitCode(ctx, store)
  })

  command("collab-run", {
    description: "Simulate running code (safe sandbox)",
    options: {
      language: {
        type: "string",
        description: "Language to run (defaults to session language)",
        required: false,
      },
    },
  }, async (ctx) => {
    return handleSessionCommands.runCode(ctx, store)
  })

  command("collab-version", {
    description: "View code version history",
  }, async (ctx) => {
    return handleSessionCommands.viewVersionHistory(ctx, store)
  })

  command("collab-undo", {
    description: "Undo last code change",
  }, async (ctx) => {
    return handleSessionCommands.undoLastChange(ctx, store)
  })

  command("collab-lock", {
    description: "Lock editing to yourself",
  }, async (ctx) => {
    return handleSessionCommands.toggleLock(ctx, store)
  })

  command("collab-promote", {
    description: "Promote a user to moderator",
    options: {
      user: {
        type: "user",
        description: "User to promote",
        required: false,
      },
    },
  }, async (ctx) => {
    return handleSessionCommands.promoteModerator(ctx, store)
  })

  command("collab-kick", {
    description: "Remove a user from the session",
    options: {
      user: {
        type: "user",
        description: "User to kick",
        required: false,
      },
    },
  }, async (ctx) => {
    return handleSessionCommands.kickUser(ctx, store)
  })

  // ── Event Handlers ────────────────────────────────────────────────────────

  event("messageCreate", async (ctx) => {
    return handleMessage.messageCreate(ctx, store)
  })

  event("messageUpdate", async (ctx) => {
    return handleMessage.messageUpdate(ctx, store)
  })

  event("guildMemberRemove", async (ctx) => {
    return handleMessage.memberLeft(ctx, store)
  })

  // ── Component Handlers ───────────────────────────────────────────────────

  // Session flow actions
  component("collab.session:submit_code", async (ctx) => {
    return handleSessionCommands.showCodeSubmissionForm(ctx, store)
  })

  component("collab.session:run", async (ctx) => {
    return handleSessionCommands.runCode(ctx, store)
  })

  component("collab.session:versions", async (ctx) => {
    return handleSessionCommands.viewVersionHistory(ctx, store)
  })

  component("collab.session:undo", async (ctx) => {
    return handleSessionCommands.undoLastChange(ctx, store)
  })

  component("collab.session:lock", async (ctx) => {
    return handleSessionCommands.toggleLock(ctx, store)
  })

  component("collab.session:leave", async (ctx) => {
    return handleSessionCommands.leaveSession(ctx, store)
  })

  component("collab.session:end", async (ctx) => {
    return handleSessionCommands.endSession(ctx, store)
  })

  component("collab.session:back_to_session", async (ctx) => {
    return handleSessionCommands.sessionStatus(ctx, store)
  })

  component("collab.session:participants", async (ctx) => {
    return handleSessionCommands.showParticipants(ctx, store)
  })

  // Session select
  component("collab.session:select", async (ctx) => {
    return handleSessionCommands.handleSessionSelect(ctx, store)
  })

  // Language selector
  component("collab.session:language", async (ctx) => {
    return handleSessionCommands.setLanguage(ctx, store)
  })

  // Join/leave/end from message buttons
  component("collab.session:join", async (ctx) => {
    return handleSessionCommands.joinSessionFromMessage(ctx, store)
  })

  // End session confirmation
  component("collab:end-session-confirm", async (ctx) => {
    return handleSessionCommands.endSession(ctx, store)
  })

  component("collab:cancel-end-session", async (ctx) => {
    return handleSessionCommands.sessionStatus(ctx, store)
  })

  // ── List Flow Components ─────────────────────────────────────────────────

  component("collab.list:select", async (ctx) => {
    return handleSessionCommands.selectSessionFromList(ctx, store)
  })

  component("collab.list:view", async (ctx) => {
    return handleSessionCommands.viewSelectedSession(ctx, store)
  })

  component("collab.list:join", async (ctx) => {
    return handleSessionCommands.joinSelectedSession(ctx, store)
  })

  component("collab.list:previous", async (ctx) => {
    return handleSessionCommands.listNavigate(ctx, store, -1)
  })

  component("collab.list:next", async (ctx) => {
    return handleSessionCommands.listNavigate(ctx, store, 1)
  })

  // ── Version Flow Components ─────────────────────────────────────────────

  component("collab.version:revert", async (ctx) => {
    return handleSessionCommands.revertToVersion(ctx, store)
  })

  component("collab.version:submit_code", async (ctx) => {
    return handleSessionCommands.useVersionAsCode(ctx, store)
  })

  component("collab.version:previous", async (ctx) => {
    return handleSessionCommands.navigateVersion(ctx, store, -1)
  })

  component("collab.version:next", async (ctx) => {
    return handleSessionCommands.navigateVersion(ctx, store, 1)
  })

  // ── Modal Handlers ───────────────────────────────────────────────────────

  modal("collab.session:submit_code", async (ctx) => {
    const code = String((ctx.values && ctx.values.code) || "").trim()
    if (!code) {
      return { content: "No code provided in the modal.", ephemeral: true }
    }
    // Inject code into ctx.args for the submit handler
    ctx.args = { ...ctx.args, code }
    return handleSessionCommands.submitCode(ctx, store)
  })
})

// ── Helpers ────────────────────────────────────────────────────────────────

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

function configInt(config, key, fallback) {
  const val = config && config[key]
  const n = Number(val)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

function configStr(config, key, fallback) {
  return String((config && config[key]) || fallback || "").trim()
}
