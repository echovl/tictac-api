import { ProfileAnalyzer } from "./analyzer.js"
import { TikTok } from "./tiktok.js"
import { Context, Env } from "hono"

export type Server = {
    tiktok: TikTok
    analyzer: ProfileAnalyzer
}

export interface ServerEnv extends Env {
    Variables: { server: Server }
}

export async function handleSearch(c: Context<ServerEnv>) {
    const srv = c.get("server")
    const searchTerm = c.req.param("searchTerm")

    if (!searchTerm) {
        c.status(400)
        return c.body("Missing search term")
    }

    if (!srv.tiktok.initialized) {
        await srv.tiktok.init()
    }

    const users = await srv.tiktok.searchUsers(searchTerm)

    return c.json(users)
}

export async function handleUser(c: Context<ServerEnv>) {
    const srv = c.get("server")
    const username = c.req.param("username")

    if (!username) {
        c.status(400)
        return c.body("Missing username")
    }

    if (!srv.tiktok.initialized) {
        await srv.tiktok.init()
    }

    const user = await srv.tiktok.getUser(username)
    const [lastVideo] = await srv.tiktok.getVideos(user, 1)
    const comments = await srv.tiktok.getComments(lastVideo, 20)

    setTimeout(() => srv.analyzer.analyze(username), 1000)

    return c.json({ user, lastVideo, comments })
}

export async function handleComments(c: Context<ServerEnv>) {
    const srv = c.get("server")
    const username = c.req.param("username")

    if (!username) {
        c.status(400)
        return c.body("Missing username")
    }

    if (!srv.tiktok.initialized) {
        await srv.tiktok.init()
    }

    const comments = await srv.analyzer.getTaggedComments(username)

    return c.json({ pending: comments.length == 0, comments })
}
