import { Redis } from "ioredis"
import { TikTok, TikTokComment } from "./tiktok"

const MAX_VIDEOS_PER_USER = 50
const MAX_COMMENTS_PER_VIDEO = 100
const PROFILE_ANALYSIS_EXPIRATION = 60 * 60 * 1 // 1 hour

export class ProfileAnalyzer {
    constructor(
        private tiktok: TikTok,
        private redis: Redis
    ) { }

    async analyze(username: string) {
        try {
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

            const comments = new Array<TikTokComment>()
            for (const video of videos) {
                comments.concat(
                    comments,
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
        } catch (e) {
            console.log(`Analyzer: Got error while analyzing ${username}`, e)
        }
    }
}
