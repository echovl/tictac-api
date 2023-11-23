import { Redis } from "ioredis"
import { pipeline } from "@xenova/transformers"

import { TikTok, TikTokComment } from "./tiktok.js"

const MAX_VIDEOS_PER_USER = 10
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

            let classifier = await pipeline("sentiment-analysis")

            // Only use english comments
            comments = comments.filter((c) => c.language === "en")

            // Sort comments by creation time ascending
            comments = comments.sort((a, b) => a.createTime - b.createTime)

            console.log(`Analyzer: Analyzing ${comments.length} comments`)

            const taggedComments = new Array<TaggedComment>()
            const commentsTags = await classifier(comments.map((c) => c.text))

            for (const [idx, comment] of comments.entries()) {
                taggedComments.push({
                    comment,
                    label: commentsTags[idx].label,
                    score: commentsTags[idx].score,
                })
            }

            await this.redis.set(
                username,
                JSON.stringify(taggedComments),
                "EX",
                PROFILE_ANALYSIS_EXPIRATION
            )
        } catch (e) {
            console.log(`Analyzer: Got error while analyzing ${username}`, e)
        }
    }
}
