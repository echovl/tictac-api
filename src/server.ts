import { ProfileAnalyzer } from "./analyzer.js"
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
    surplus?: number
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
    const aggregatedCommentsByLabel = new Array<AggregatedComment>()
    const aggregatedCommentsByScore = new Array<AggregatedComment>()
    const wordCloud = new Array<AggregatedWord>()

    for (const tag of comments) {
        let day = dayjs.utc(tag.comment.createTime * 1000).startOf("day")
        let hour = dayjs.utc(tag.comment.createTime * 1000).startOf("hour")

        const existing = aggregatedCommentsByLabel.find(
            (c) =>
                c.date.getTime() === day.toDate().getTime() &&
                c.group == tag.label
        )
        const isPositive = tag.label == "POSITIVE"

        aggregatedCommentsByScore.push({
            date: hour.toDate(),
            group: tag.label,
            value: tag.score * 100,
            surplus: 10,
        })

        if (existing) {
            existing.value += isPositive ? 1 : -1
        } else {
            aggregatedCommentsByLabel.push({
                date: day.toDate(),
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

    // Sort comments by date (ascending) and label!
    const positives = aggregatedCommentsByLabel
        .filter((c) => c.group === "POSITIVE")
        .toSorted((a, b) => {
            if (a.date.getTime() == b.date.getTime()) {
                return a.group > b.group ? 1 : -1
            }
            return a.date.getTime() > b.date.getTime() ? 1 : -1
        })

    const negatives = aggregatedCommentsByLabel
        .filter((c) => c.group === "NEGATIVE")
        .toSorted((a, b) => {
            if (a.date.getTime() == b.date.getTime()) {
                return a.group > b.group ? 1 : -1
            }
            return a.date.getTime() > b.date.getTime() ? 1 : -1
        })

    // Sort comments by score (acending)
    aggregatedCommentsByScore.sort((a, b) => {
        if (a.date.getTime() == b.date.getTime()) {
            return a.group > b.group ? 1 : -1
        }
        return a.date.getTime() > b.date.getTime() ? 1 : -1
    })

    return c.json({
        status,
        groupedComments: positives.concat(negatives),
        comments: aggregatedCommentsByScore,
        wordCloud,
    })
}
