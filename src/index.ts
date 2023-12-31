import {
    ServerEnv,
    Server,
    handleSearch,
    handleUser,
    handleComments,
} from "./server.js"

import { serve } from "@hono/node-server"
import { logger } from "hono/logger"
import { cors } from "hono/cors"
import { Hono } from "hono"
import { TikTok } from "./tiktok.js"
import { Redis } from "ioredis"
import { ProfileAnalyzer } from "./analyzer.js"

const redis = new Redis(process.env.REDIS_URL as string)
const tiktok = new TikTok(process.env.MS_TOKEN as string)

const srv: Server = {
    tiktok,
    analyzer: new ProfileAnalyzer(redis),
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
app.get("/comments/:username", handleComments)

console.log("Starting server")

serve({
    port: parseInt(process.env.PORT || "3000"),
    fetch: app.fetch,
})
