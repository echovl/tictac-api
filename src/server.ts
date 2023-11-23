import { TikTok } from "./tiktok"
import { Context, Env } from "hono"

export type Server = {
    msToken: string
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

    const tiktok = new TikTok(srv.msToken)

    await tiktok.init()

    const users = await tiktok.searchUsers(searchTerm)

    await tiktok.close()

    return c.json(users)
}

export async function handleUser(c: Context<ServerEnv>) {
    const srv = c.get("server")
    const username = c.req.param("username")

    if (!username) {
        c.status(400)
        return c.body("Missing username")
    }

    const tiktok = new TikTok(srv.msToken)

    await tiktok.init()

    const user = await tiktok.getUser(username)
    const [lastVideo] = await tiktok.getVideos(user, 1)
    const comments = await tiktok.getComments(lastVideo, 20)

    await tiktok.close()

    return c.json({ user, lastVideo, comments })
}
