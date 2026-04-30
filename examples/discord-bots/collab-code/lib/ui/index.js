// UI DSL — Go-side builders + JS-side stateful helpers
//
// Builders come from require("ui") (registered as a native Goja module).
// Stateful flow helpers come from screen.js (pure JS using ctx.store).

module.exports = {
  ...require("ui"),
  ...require("./screen"),
}
