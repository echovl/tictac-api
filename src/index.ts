import { ServerEnv, Server, handleSearch, handleUser } from "./server"
import { logger } from "hono/logger"
import { Hono } from "hono"

const srv: Server = {
    msToken:
        "2kt14PJbSR9PnKwNw9ZMAHtuGhjx_CzokqtR_PIcJaIeTIvO7bMfelxY5KEXAbaenzWNvh4L-_qqOaZVITV9dPWv9o9UB0cy7U-9qx4yycMq9HoPObSAjtDOl1nayxyBd_pzumi4bOzlurqoQw==",
}
const app = new Hono<ServerEnv>()

app.use("*", logger())

app.use("*", async (c, next) => {
    c.set("server", srv)
    await next()
})

app.get("/search/:searchTerm", handleSearch)
app.get("/user/:username", handleUser)

export default {
    port: process.env.PORT || 3000,
    fetch: app.fetch,
} as unknown
