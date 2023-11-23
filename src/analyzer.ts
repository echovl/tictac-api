import { Redis } from "ioredis"
import { pipeline } from "@xenova/transformers"

import { TikTok, TikTokComment } from "./tiktok.js"

const MAX_VIDEOS_PER_USER = 15
const MAX_COMMENTS_PER_VIDEO = 50
const PROFILE_ANALYSIS_EXPIRATION = 60 * 60 * 1 // 1 hour

export type TaggedComment = {
    comment: TikTokComment
    label: string
    score: number
}

export class ProfileAnalyzer {
    constructor(
        private tiktok: TikTok,
        private redis: Redis
    ) {}

    async getTaggedComments(username: string): Promise<TaggedComment[]> {
        const cached = await this.redis.get(username)
        if (cached) {
            return JSON.parse(cached)
        }

        return []
    }

    async analyze(username: string) {
        try {
            if (!this.tiktok.initialized) {
                await this.tiktok.init()
            }

            const user = await this.tiktok.getUser(username)

            // Check if the profile is already cached
            if (await this.redis.get(username)) {
                return
            }

            console.log(`Analyzer: Analyzing ${username}`)

            const videos = await this.tiktok.getVideos(
                user,
                MAX_VIDEOS_PER_USER
            )

            let comments = new Array<TikTokComment>()
            for (const video of videos) {
                comments = comments.concat(
                    await this.tiktok.getComments(video, MAX_COMMENTS_PER_VIDEO)
                )
            }

            console.log(`Analyzer: Done fetching comments`)

            console.log(`Analyzer: Loading classifier`)

            let classifier = await pipeline("sentiment-analysis")

            console.log(`Analyzer: Done loading classifier`)

            // Only use english comments
            comments = comments.filter((c) => c.language === "en")

            // Sort comments by creation time ascending
            comments = comments.sort((a, b) => a.createTime - b.createTime)

            console.log(`Analyzer: Analyzing ${comments.length} comments`)

            const taggedComments = new Array<TaggedComment>()

            console.log(`Analyzer: Tagging comments`)

            for (const comment of comments) {
                const commentTag = await classifier(comment.text)
                taggedComments.push({
                    comment,
                    label: commentTag[0].label,
                    score: commentTag[0].score,
                })
            }

            console.log(`Analyzer: Done tagging comments`)

            await this.redis.set(
                username,
                JSON.stringify(taggedComments),
                "EX",
                PROFILE_ANALYSIS_EXPIRATION
            )

            console.log(`Analyzer: Done analyzing ${username}`)
        } catch (e) {
            console.log(`Analyzer: Got error while analyzing ${username}`, e)
        }
    }
}
