import { ProfileAnalyzer, TaggedComment } from "./analyzer.js"
import { TikTok } from "./tiktok.js"
import { Context, Env } from "hono"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc.js"

dayjs.extend(utc)

type AggregatedComment = {
    day: number
    year: number
    month: number
    date: Date
    taggedComments: Array<TaggedComment>
    positiveCount: number
    negativeCount: number
}

type AggregatedWord = {
    label: string
    count: number
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
        const date = dayjs.utc(tag.comment.createTime * 1000)
        const year = date.year()
        const month = date.month()
        const day = date.date()

        const existing = aggregatedComments.find(
            (c) => c.year == year && c.month == month && c.day == day
        )
        const isPositive = tag.label == "POSITIVE"

        if (existing) {
            existing.positiveCount += isPositive ? 1 : 0
            existing.negativeCount += isPositive ? 0 : 1
            existing.taggedComments.push(tag)
        } else {
            aggregatedComments.push({
                day,
                year,
                month,
                date: date.toDate(),
                taggedComments: [tag],
                positiveCount: isPositive ? 1 : 0,
                negativeCount: isPositive ? 0 : 1,
            })
        }

        const text = tag.comment.text.replace(/[^\w\s]/g, "")

        const words = text.split(" ")
        for (const word of words) {
            const existing = wordCloud.find((c) => c.label == word)
            if (existing) {
                existing.count += 1
            } else {
                wordCloud.push({ label: word, count: 1 })
            }
        }
    }

    return c.json({
        status,
        commentsPerDay: aggregatedComments,
        wordCloud,
    })
}
