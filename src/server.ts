import { ProfileAnalyzer, TaggedComment } from "./analyzer.js"
import { TikTok } from "./tiktok.js"
import { Context, Env } from "hono"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc.js"

dayjs.extend(utc)

type AggregatedComment = {
    // day: number
    // year: number
    // month: number
    group: string
    date: Date
    // taggedComments: Array<TaggedComment>
    value: number
}

type AggregatedWord = {
    word: string
    value: number
    group: string
}

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

    const [comments, status] = await srv.analyzer.getTaggedComments(username)
    const aggregatedComments = new Array<AggregatedComment>()
    const wordCloud = new Array<AggregatedWord>()

    for (const tag of comments) {
        let date = dayjs.utc(tag.comment.createTime * 1000).startOf("day")

        const existing = aggregatedComments.find(
            (c) =>
                c.date.getTime() === date.toDate().getTime() &&
                c.group == tag.label
        )
        const isPositive = tag.label == "POSITIVE"

        if (existing) {
            existing.value += isPositive ? 1 : -1
        } else {
            aggregatedComments.push({
                date: date.toDate(),
                group: tag.label,
                value: isPositive ? 1 : -1,
            })
        }

        const text = tag.comment.text.replace(/[^\w\s]/g, "")

        const words = text.split(" ")
        for (const word of words) {
            const existing = wordCloud.find((c) => c.word == word)
            if (existing) {
                existing.value += 1
            } else {
                wordCloud.push({
                    word,
                    value: 1,
                    group: tag.comment.language,
                })
            }
        }
    }

    return c.json({
        status,
        commentsPerDay: aggregatedComments,
        wordCloud,
    })
}
