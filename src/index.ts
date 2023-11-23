import { ServerEnv, Server, handleSearch, handleUser } from "./server.js"
import { serve } from "@hono/node-server"
import { logger } from "hono/logger"
import { cors } from "hono/cors"
import { Hono } from "hono"
import { TikTok } from "./tiktok.js"
import { Redis } from "ioredis"
import { ProfileAnalyzer } from "./analyzer.js"

console.log(process.env)
const redis = new Redis(process.env.REDIS_URL as string)
const tiktok = new TikTok(
    "2kt14PJbSR9PnKwNw9ZMAHtuGhjx_CzokqtR_PIcJaIeTIvO7bMfelxY5KEXAbaenzWNvh4L-_qqOaZVITV9dPWv9o9UB0cy7U-9qx4yycMq9HoPObSAjtDOl1nayxyBd_pzumi4bOzlurqoQw=="
)

const srv: Server = {
    tiktok,
    analyzer: new ProfileAnalyzer(tiktok, redis),
}

const app = new Hono<ServerEnv>()

app.use("*", cors({ origin: "*" }))
app.use("*", logger())
app.use("*", async (c, next) => {
    c.set("server", srv)
    await next()
})

app.get("/search/:searchTerm", handleSearch)
app.get("/user/:username", handleUser)

console.log("Starting server")

serve({
    port: parseInt(process.env.PORT || "3000"),
    fetch: app.fetch,
})
