import { ProfileAnalyzer } from "./analyzer"
import { TikTok } from "./tiktok"
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

    const user = await srv.tiktok.getUser(username)
    const [lastVideo] = await srv.tiktok.getVideos(user, 1)
    const comments = await srv.tiktok.getComments(lastVideo, 20)

    return c.json({ user, lastVideo, comments })
}
