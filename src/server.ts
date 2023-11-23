import { ProfileAnalyzer, TaggedComment } from "./analyzer.js"
import { TikTok } from "./tiktok.js"
import { Context, Env } from "hono"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc.js"

dayjs.extend(utc)

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

type AggregatedComment = {
    day: number
    year: number
    month: number
    date: Date
    taggedComments: Array<TaggedComment>
    positiveCount: number
    negativeCount: number
}

export async function handleComments(c: Context<ServerEnv>) {
    const srv = c.get("server")
    const username = c.req.param("username")

    if (!username) {
        c.status(400)
        return c.body("Missing username")
    }

    const comments = await srv.analyzer.getTaggedComments(username)
    const aggregatedComments = new Array<AggregatedComment>()

    for (const comment of comments) {
        const date = dayjs.utc(comment.comment.createTime * 1000)
        const year = date.year()
        const month = date.month()
        const day = date.date()

        const existing = aggregatedComments.find(
            (c) => c.year == year && c.month == month && c.day == day
        )
        const isPositive = comment.label == "POSITIVE"

        if (existing) {
            existing.positiveCount += isPositive ? 1 : 0
            existing.negativeCount += isPositive ? 0 : 1
            existing.taggedComments.push(comment)
        } else {
            aggregatedComments.push({
                day,
                year,
                month,
                date: date.toDate(),
                taggedComments: [comment],
                positiveCount: isPositive ? 1 : 0,
                negativeCount: isPositive ? 0 : 1,
            })
        }
    }

    return c.json({
        pending: comments.length == 0,
        commentsPerDay: aggregatedComments,
    })
}
