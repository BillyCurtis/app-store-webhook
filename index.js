const { Collection, EmbedBuilder, Util, WebhookClient } = require("discord.js")
const fs = require("fs")
const config = require("./config")
const webhook = new WebhookClient({ id: config.id, token: config.token })
const store = require("app-store-scraper")
const { EventEmitter } = require("events")
let data = require("./data.json")

console.log("[WEBHOOK] Ready!")

if (!config.interval) return console.error("[ERR] No interval was set")
if (config.apps.length < 1) return console.error("[ERR] No apps to check")

const errors = new Collection()
for (const app of config.apps) errors.set(app, { error: false })

const apps = new EventEmitter()
let timeout
async function check() {
    if (errors.every(e => e.error)) return clearTimeout(timeout)
    for (const app of config.apps) {
        if (errors.get(app).error) continue
        try {
            const res = await store.app({ id: app, country: "gb" })
            if (!data[res.id]) {
                data[res.id] = {
                    id: res.id,
                    appId: res.appId,
                    released: res.released,
                    releases: []
                }
                await fs.writeFileSync("./data.json", JSON.stringify(data))
                console.log("[DATA] Wrote to data.json")
            }
            if (!data[res.id].releases.find(r => r.updated === res.updated && r.version === res.version))
                apps.emit("update", res)
            else
                continue
        } catch (err) {
            apps.emit("error", err)
            if (err.toString() === "Error: App not found (404)") errors.set(app, { error: true })
            continue
        }
    }
    timeout = setTimeout(check, config.interval)
}
check()

apps.on("update", async app => {
    console.log(`[${app.appId}] New update`)
    data[app.id].releases.push({
        updated: app.updated,
        version: app.version
    })
    await fs.writeFileSync("./data.json", JSON.stringify(data))
    console.log("[DATA] Wrote to data.json")

    const embed = new EmbedBuilder()
        .setAuthor({ name: app.developer, iconURL: app.icon })
        .setTitle(`${app.title} (${app.appId})`)
        .setURL(app.url)
        .setThumbnail(app.icon)
        .setColor(0x1598f7)
        .setFooter({ text: app.developer, iconURL: app.icon })
        .setTimestamp(new Date(app.updated))

    if (app.releaseNotes.length > 1024) {
        const split = Util.splitMessage(app.releaseNotes, { maxLength: 1024 })
        for (let i = 0; i < split.length; i++) embed.addFields(i === 0 ? `v${app.version}` : "\u200B", split[i])
    } else {
        embed.addFields([{ name: `v${app.version}`, value: app.releaseNotes }])
    }

    console.log("[WEBHOOK] Sending message")
    webhook.send({ embeds: [embed] })
     .then(msg => console.log("[WEBHOOK] Message sent!"))
     .catch(console.error)
})

apps.on("error", console.error)

process.on("unhandledRejection", err => console.log(err))
