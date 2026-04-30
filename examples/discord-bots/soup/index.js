const { defineBot } = require("discord")
const ui = require("ui")

const SOUPS = [
  {
    id: "tomato",
    name: "Tomato Basil Soup",
    emoji: "🍅",
    color: 0xE74C3C,
    broth: "roasted tomato broth",
    garnish: "basil ribbons and black pepper",
    vibe: "bright, cozy, and impossible to mess up",
  },
  {
    id: "miso",
    name: "Miso Soup",
    emoji: "🍜",
    color: 0xF1C40F,
    broth: "white miso dashi",
    garnish: "scallions, tofu cubes, and wakame",
    vibe: "quiet, warm, and extremely restorative",
  },
  {
    id: "lentil",
    name: "Lentil Soup",
    emoji: "🥣",
    color: 0xD35400,
    broth: "smoky vegetable stock",
    garnish: "lemon, parsley, and olive oil",
    vibe: "hearty enough to fix your whole afternoon",
  },
  {
    id: "mushroom",
    name: "Creamy Mushroom Soup",
    emoji: "🍄",
    color: 0x8E44AD,
    broth: "mushroom cream broth",
    garnish: "thyme, cracked pepper, and crispy shallots",
    vibe: "deep forest comfort in a bowl",
  },
]

const BURGERS = [
  {
    id: "classic",
    name: "Classic Cheeseburger",
    emoji: "🍔",
    color: 0xD35400,
    patty: "all-beef patty",
    cheese: "american",
    vibe: "the one that never lets you down",
  },
  {
    id: "bbq",
    name: "BBQ Bacon Burger",
    emoji: "🥓",
    color: 0x8B4513,
    patty: "smoked beef patty",
    cheese: "cheddar",
    vibe: "sticky, smoky, and a little reckless",
  },
  {
    id: "mushroom-swiss",
    name: "Mushroom Swiss Burger",
    emoji: "🍄",
    color: 0x8E44AD,
    patty: "grilled beef patty",
    cheese: "swiss",
    vibe: "earthy, melty, and surprisingly elegant",
  },
  {
    id: "spicy",
    name: "Spicy Jalapeño Burger",
    emoji: "🌶️",
    color: 0xC0392B,
    patty: "pepper-crusted patty",
    cheese: "pepper jack",
    vibe: "hot enough to make you sweat",
  },
]

const DEFAULT_SOUP = { selectedId: SOUPS[0].id, heat: "medium", toppings: "croutons", note: "" }
const DEFAULT_BURGER = { selectedId: BURGERS[0].id, heat: "medium", toppings: "pickles", note: "" }
const kitchenState = new Map()

const SOUP_IDS = {
  select: "soup:select",
  mild: "soup:heat:mild",
  medium: "soup:heat:medium",
  spicy: "soup:heat:spicy",
  customize: "soup:customize",
  cook: "soup:cook",
  share: "soup:share",
  reset: "soup:reset",
}

const BURGER_IDS = {
  select: "burger:select",
  mild: "burger:heat:mild",
  medium: "burger:heat:medium",
  spicy: "burger:heat:spicy",
  customize: "burger:customize",
  cook: "burger:cook",
  share: "burger:share",
  reset: "burger:reset",
}

module.exports = defineBot(({ command, component, modal, event, configure }) => {
  configure({
    name: "soup",
    description: "A no-database soup-and-burger example bot built with the UI DSL",
    category: "examples",
  })

  event("ready", async (ctx) => {
    ctx.log.info("soup bot ready", { user: ctx.me && ctx.me.username })
  })

  event("messageCreate", async (ctx) => {
    const content = String((ctx.message && ctx.message.content) || "").trim().toLowerCase()
    if (content === "!soup") {
      await ctx.reply({ content: "Soup bot is simmering. Try `/soup`, `/burger`, `/soup-menu`, or `/burger-menu`." })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════
  //  Soup
  // ══════════════════════════════════════════════════════════════════════════

  command("soup", {
    description: "Open the soup kitchen and build a bowl",
  }, async (ctx) => {
    const state = saveState("soup", ctx, DEFAULT_SOUP)
    return renderSoupKitchen(state)
  })

  command("soup-menu", {
    description: "Show today's soup menu",
  }, async () => {
    return ui.message()
      .ephemeral()
      .content("Today's soup menu:")
      .embed(
        ui.embed("🍲 Soup Menu")
          .color(0x57F287)
          .description(SOUPS.map((s) => `${s.emoji} **${s.name}** — ${s.vibe}`).join("\n"))
          .footer("Use /soup to make a bowl")
      )
      .build()
  })

  component(SOUP_IDS.select, async (ctx) => {
    const selectedId = firstValue(ctx.values) || SOUPS[0].id
    const state = saveState("soup", ctx, { ...loadState("soup", ctx), selectedId })
    return renderSoupKitchen(state)
  })

  component(SOUP_IDS.mild, async (ctx) => setHeat("soup", ctx, "mild"))
  component(SOUP_IDS.medium, async (ctx) => setHeat("soup", ctx, "medium"))
  component(SOUP_IDS.spicy, async (ctx) => setHeat("soup", ctx, "spicy"))

  component(SOUP_IDS.customize, async (ctx) => {
    const state = loadState("soup", ctx)
    await ctx.showModal(
      ui.form(SOUP_IDS.customize, "Customize your soup")
        .text("toppings", "Toppings")
        .value(state.toppings || "croutons")
        .placeholder("croutons, chili crisp, herbs")
        .max(100)
        .textarea("note", "Chef note")
        .placeholder("extra hot, more lemon, tiny bowl, etc.")
        .max(300)
        .build()
    )
  })

  modal(SOUP_IDS.customize, async (ctx) => {
    const state = loadState("soup", ctx)
    const toppings = String((ctx.values || {}).toppings || state.toppings || "croutons").trim()
    const note = String((ctx.values || {}).note || "").trim()
    const next = saveState("soup", ctx, { ...state, toppings, note })
    return renderSoupKitchen(next)
  })

  component(SOUP_IDS.cook, async (ctx) => {
    const state = loadState("soup", ctx)
    const soup = getSoup(state.selectedId)
    return ui.message()
      .ephemeral()
      .content(`${soup.emoji} Your **${soup.name}** is ready.`)
      .embed(
        ui.card("Soup complete")
          .color(soup.color)
          .description(`A steaming bowl of ${soup.broth}, finished with ${state.toppings || soup.garnish}.`)
          .meta("Heat", state.heat || "medium", true)
          .meta("Garnish", state.toppings || soup.garnish, true)
          .meta("Chef note", state.note || "serve immediately")
          .footer("No database was harmed in the making of this soup")
      )
      .row(
        ui.button(SOUP_IDS.share, "Share bowl", "success"),
        ui.button(SOUP_IDS.reset, "Make another", "secondary"),
      )
      .build()
  })

  component(SOUP_IDS.share, async (ctx) => {
    const state = loadState("soup", ctx)
    const soup = getSoup(state.selectedId)
    await ctx.defer({ ephemeral: true })
    if (ctx.channel && ctx.channel.id) {
      await ctx.discord.channels.send(ctx.channel.id, {
        content: `${soup.emoji} **Soup's on:** ${soup.name} (${state.heat || "medium"}) with ${state.toppings || soup.garnish}.`,
      })
    }
    await ctx.edit({ content: "Shared the soup bowl to the channel." })
  })

  component(SOUP_IDS.reset, async (ctx) => {
    const state = saveState("soup", ctx, DEFAULT_SOUP)
    return renderSoupKitchen(state)
  })

  // ══════════════════════════════════════════════════════════════════════════
  //  Burgers
  // ══════════════════════════════════════════════════════════════════════════

  command("burger", {
    description: "Open the grill and build a burger",
  }, async (ctx) => {
    const state = saveState("burger", ctx, DEFAULT_BURGER)
    return renderBurgerKitchen(state)
  })

  command("burger-menu", {
    description: "Show today's burger menu",
  }, async () => {
    return ui.message()
      .ephemeral()
      .content("Today's burger menu:")
      .embed(
        ui.embed("🍔 Burger Menu")
          .color(0xE67E22)
          .description(BURGERS.map((b) => `${b.emoji} **${b.name}** — ${b.vibe}`).join("\n"))
          .footer("Use /burger to build one")
      )
      .build()
  })

  component(BURGER_IDS.select, async (ctx) => {
    const selectedId = firstValue(ctx.values) || BURGERS[0].id
    const state = saveState("burger", ctx, { ...loadState("burger", ctx), selectedId })
    return renderBurgerKitchen(state)
  })

  component(BURGER_IDS.mild, async (ctx) => setHeat("burger", ctx, "mild"))
  component(BURGER_IDS.medium, async (ctx) => setHeat("burger", ctx, "medium"))
  component(BURGER_IDS.spicy, async (ctx) => setHeat("burger", ctx, "spicy"))

  component(BURGER_IDS.customize, async (ctx) => {
    const state = loadState("burger", ctx)
    await ctx.showModal(
      ui.form(BURGER_IDS.customize, "Customize your burger")
        .text("toppings", "Toppings")
        .value(state.toppings || "pickles")
        .placeholder("pickles, onions, avocado, fried egg")
        .max(100)
        .textarea("note", "Chef note")
        .placeholder("smash it, extra cheese, well done, etc.")
        .max(300)
        .build()
    )
  })

  modal(BURGER_IDS.customize, async (ctx) => {
    const state = loadState("burger", ctx)
    const toppings = String((ctx.values || {}).toppings || state.toppings || "pickles").trim()
    const note = String((ctx.values || {}).note || "").trim()
    const next = saveState("burger", ctx, { ...state, toppings, note })
    return renderBurgerKitchen(next)
  })

  component(BURGER_IDS.cook, async (ctx) => {
    const state = loadState("burger", ctx)
    const burger = getBurger(state.selectedId)
    return ui.message()
      .ephemeral()
      .content(`${burger.emoji} Your **${burger.name}** is ready.`)
      .embed(
        ui.card("Burger complete")
          .color(burger.color)
          .description(`A juicy ${burger.patty} with ${burger.cheese} cheese and ${state.toppings || "pickles"}.`)
          .meta("Heat", state.heat || "medium", true)
          .meta("Cheese", burger.cheese, true)
          .meta("Toppings", state.toppings || "pickles")
          .meta("Chef note", state.note || "serve immediately")
          .footer("No database was harmed in the making of this burger")
      )
      .row(
        ui.button(BURGER_IDS.share, "Share burger", "success"),
        ui.button(BURGER_IDS.reset, "Make another", "secondary"),
      )
      .build()
  })

  component(BURGER_IDS.share, async (ctx) => {
    const state = loadState("burger", ctx)
    const burger = getBurger(state.selectedId)
    await ctx.defer({ ephemeral: true })
    if (ctx.channel && ctx.channel.id) {
      await ctx.discord.channels.send(ctx.channel.id, {
        content: `${burger.emoji} **Burger's up:** ${burger.name} (${state.heat || "medium"}) with ${state.toppings || "pickles"}.`,
      })
    }
    await ctx.edit({ content: "Shared the burger to the channel." })
  })

  component(BURGER_IDS.reset, async (ctx) => {
    const state = saveState("burger", ctx, DEFAULT_BURGER)
    return renderBurgerKitchen(state)
  })
})

function setHeat(mode, ctx, heat) {
  const state = saveState(mode, ctx, { ...loadState(mode, ctx), heat })
  return mode === "soup" ? renderSoupKitchen(state) : renderBurgerKitchen(state)
}

function renderSoupKitchen(state) {
  const soup = getSoup(state.selectedId)
  const heat = state.heat || "medium"
  const toppings = state.toppings || "croutons"

  return ui.message()
    .ephemeral()
    .content("Welcome to the soup kitchen. Pick a soup, tune the heat, then cook it.")
    .embed(
      ui.card(`${soup.emoji} ${soup.name}`)
        .color(soup.color)
        .description(`${soup.vibe}. Built on ${soup.broth}, finished with ${toppings}.`)
        .meta("Heat", heat, true)
        .meta("Base", soup.broth, true)
        .meta("Toppings", toppings)
        .meta("Chef note", state.note || "—")
    )
    .row(
      ui.select(SOUP_IDS.select)
        .placeholder("Choose your soup")
        .optionEntries(SOUPS.map((s) => ({
          id: s.id,
          label: `${s.emoji} ${s.name}`,
          description: s.vibe,
        })), soup.id)
    )
    .row(
      ui.button(SOUP_IDS.mild, "Mild", heat === "mild" ? "success" : "secondary"),
      ui.button(SOUP_IDS.medium, "Medium", heat === "medium" ? "success" : "secondary"),
      ui.button(SOUP_IDS.spicy, "Spicy", heat === "spicy" ? "success" : "secondary"),
    )
    .row(
      ui.button(SOUP_IDS.customize, "Customize", "primary"),
      ui.button(SOUP_IDS.cook, "Cook soup", "success"),
      ui.button(SOUP_IDS.reset, "Reset", "secondary"),
    )
    .build()
}

function renderBurgerKitchen(state) {
  const burger = getBurger(state.selectedId)
  const heat = state.heat || "medium"
  const toppings = state.toppings || "pickles"

  return ui.message()
    .ephemeral()
    .content("Welcome to the grill. Pick a burger, tune the heat, then cook it.")
    .embed(
      ui.card(`${burger.emoji} ${burger.name}`)
        .color(burger.color)
        .description(`${burger.vibe}. ${burger.patty}, ${burger.cheese} cheese, finished with ${toppings}.`)
        .meta("Heat", heat, true)
        .meta("Cheese", burger.cheese, true)
        .meta("Toppings", toppings)
        .meta("Chef note", state.note || "—")
    )
    .row(
      ui.select(BURGER_IDS.select)
        .placeholder("Choose your burger")
        .optionEntries(BURGERS.map((b) => ({
          id: b.id,
          label: `${b.emoji} ${b.name}`,
          description: b.vibe,
        })), burger.id)
    )
    .row(
      ui.button(BURGER_IDS.mild, "Mild", heat === "mild" ? "success" : "secondary"),
      ui.button(BURGER_IDS.medium, "Medium", heat === "medium" ? "success" : "secondary"),
      ui.button(BURGER_IDS.spicy, "Spicy", heat === "spicy" ? "success" : "secondary"),
    )
    .row(
      ui.button(BURGER_IDS.customize, "Customize", "primary"),
      ui.button(BURGER_IDS.cook, "Cook burger", "success"),
      ui.button(BURGER_IDS.reset, "Reset", "secondary"),
    )
    .build()
}

function stateKey(mode, ctx) {
  const guildId = String((ctx.guild && ctx.guild.id) || "dm")
  const channelId = String((ctx.channel && ctx.channel.id) || "channel")
  const userId = String((ctx.user && ctx.user.id) || (ctx.member && ctx.member.id) || "user")
  return `${mode}:${guildId}:${channelId}:${userId}`
}

function loadState(mode, ctx) {
  const defaults = mode === "soup" ? DEFAULT_SOUP : DEFAULT_BURGER
  return { ...defaults, ...(kitchenState.get(stateKey(mode, ctx)) || {}) }
}

function saveState(mode, ctx, state) {
  const defaults = mode === "soup" ? DEFAULT_SOUP : DEFAULT_BURGER
  const next = { ...defaults, ...state }
  kitchenState.set(stateKey(mode, ctx), next)
  return next
}

function getSoup(id) {
  return SOUPS.find((s) => s.id === id) || SOUPS[0]
}

function getBurger(id) {
  return BURGERS.find((b) => b.id === id) || BURGERS[0]
}

function firstValue(values) {
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
