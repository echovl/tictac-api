import { Redis } from "ioredis"
import { pipeline } from "@xenova/transformers"

import { TikTok, TikTokComment } from "./tiktok.js"

const MAX_VIDEOS_PER_USER = 50
const MAX_COMMENTS_PER_VIDEO = 100
const PROFILE_ANALYSIS_EXPIRATION = 60 * 60 * 1 // 1 hour

export class ProfileAnalyzer {
    constructor(
        private tiktok: TikTok,
        private redis: Redis
    ) {}

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

            await this.redis.set(
                username,
                JSON.stringify(comments),
                "EX",
                PROFILE_ANALYSIS_EXPIRATION
            )

            const t0 = performance.now()
            let classifier = await pipeline("sentiment-analysis")
            const t1 = performance.now()
            console.log(`Analyzer: Loaded sentiment-analysis in ${t1 - t0}ms`)

            for (const comment of comments) {
                const output = await classifier(comment.text)
                console.log(comment.text, output)
            }
        } catch (e) {
            console.log(`Analyzer: Got error while analyzing ${username}`, e)
        }
    }
}
