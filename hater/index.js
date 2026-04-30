const { defineBot } = require("discord")
const ui = require("ui")

const ROASTS = [
  "I would explain it to you, but I left my crayons in another server.",
  "Your aura has the latency of a potato on hotel Wi-Fi.",
  "I checked the logs. Even the warnings are disappointed.",
  "You're not the problem. You're the regression test for the problem.",
  "I have seen better decisions from a random number generator.",
  "If confidence compiled code, you'd still have syntax errors.",
]

const BACKHANDED = [
  "You are technically present, which is more than I expected.",
  "That was almost a thought. Proud of you.",
  "You're doing your best, and statistics says that has to be enough sometimes.",
  "I admire your commitment to making me lower my expectations.",
]

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function targetName(ctx) {
  if (ctx.args && ctx.args.user) return `<@${ctx.args.user}>`
  if (ctx.user && ctx.user.id) return `<@${ctx.user.id}>`
  return "you"
}

module.exports = defineBot(({ command, event, component, modal, configure }) => {
  configure({
    name: "hater",
    description: "A Discord bot that hates you, reluctantly responds, and judges every message.",
    category: "examples",
  })

  command("hate", {
    description: "Receive the bot's current level of contempt",
  }, async (ctx) => {
    const contempt = Math.floor(Math.random() * 101)
    return ui.message()
      .content(`I hate you ${contempt}%. Do not ask what would make it 100%.`)
      .embed(
        ui.embed("Contempt report")
          .description(pick(ROASTS))
          .color(0xED4245)
          .field("Target", targetName(ctx), true)
          .field("Diagnosis", "Terminally annoying", true)
          .footer("Built with the UI DSL, unfortunately for you")
      )
      .row(
        ui.button("hater:roast", "Roast me again", "danger"),
        ui.button("hater:mercy", "Beg for mercy", "secondary"),
        ui.button("hater:apology", "Write apology", "primary"),
      )
      .build()
  })

  command("roast", {
    description: "Roast yourself or another user",
    options: {
      user: {
        type: "user",
        description: "The unfortunate target",
        required: false,
      },
    },
  }, async (ctx) => {
    return {
      content: `${targetName(ctx)}, ${pick(ROASTS)}`,
      allowedMentions: { parse: [] },
    }
  })

  command("compliment", {
    description: "Force the hater bot to say something nice-ish",
  }, async () => {
    return ui.message()
      .ephemeral()
      .content(pick(BACKHANDED))
      .embed(
        ui.embed("Forced compliment")
          .description("That counted as kindness. I am exhausted.")
          .color(0xFEE75C)
      )
      .build()
  })

  component("hater:roast", async (ctx) => {
    return {
      content: `${targetName(ctx)}, ${pick(ROASTS)}`,
      ephemeral: true,
    }
  })

  component("hater:mercy", async () => {
    return ui.message()
      .ephemeral()
      .content("Mercy denied. Try having fewer opinions next time.")
      .embed(ui.embed("Appeal rejected").description("No notes. Actually, too many notes.").color(0xED4245))
      .build()
  })

  component("hater:apology", async (ctx) => {
    await ctx.showModal(
      ui.form("hater:apology:submit", "Apologize to the hater bot")
        .text("subject", "What are you apologizing for?").required().min(3).max(80)
        .textarea("details", "Make it convincing").required().min(10).max(500)
        .build()
    )
  })

  modal("hater:apology:submit", async (ctx) => {
    const subject = String((ctx.values || {}).subject || "your general vibe").trim()
    const details = String((ctx.values || {}).details || "(suspiciously empty)").trim()
    return ui.message()
      .ephemeral()
      .content("Apology received. Forgiveness not found.")
      .embed(
        ui.embed("Apology review")
          .description("I skimmed it and chose resentment.")
          .color(0x5865F2)
          .field("Subject", subject || "your general vibe", true)
          .field("Verdict", "Rejected with prejudice", true)
          .field("Evidence", details.slice(0, 1000) || "(suspiciously empty)")
      )
      .build()
  })

  event("ready", async (ctx) => {
    ctx.log.info("hater bot woke up annoyed", {
      user: ctx.me && ctx.me.username,
      script: ctx.metadata && ctx.metadata.scriptPath,
    })
  })

  event("messageCreate", async (ctx) => {
    const content = (ctx.message && ctx.message.content || "").trim().toLowerCase()
    if (content === "!hate" || content === "!roastme") {
      await ctx.reply({
        content: `${pick(ROASTS)} Also, slash commands exist. Use /hate like a civilized gremlin.`,
        allowedMentions: { parse: [] },
      })
    }
  })
})
