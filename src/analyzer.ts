import { Redis } from "ioredis"
import { pipeline } from "@xenova/transformers"

import { TikTok, TikTokComment } from "./tiktok.js"
import { sleep } from "./util.js"

const MAX_VIDEOS_PER_USER = 15
const MAX_COMMENTS_PER_VIDEO = 50
const PROFILE_ANALYSIS_EXPIRATION = 60 * 60 * 1 // 1 hour
const ANALYZER_MS_TOKEN =
    "pOwbuRkQLAa7cOjRwczTiDMvnta6JOmefDPCu-AJSNjeHmUEl4DQJWf8xplQzFsior6fPKkoZzxfHHLO5OdqZJ7SsFEd4GV-I7flhNBwxSt70DDbxajxl4veDmIVuvJHd1KAi4vq4HwKI2qq"

export enum TaggingStatus {
    Pending = "pending",
    InProgress = "in_progress",
    Done = "done",
    Error = "error",
}

export type TaggedComment = {
    comment: TikTokComment
    label: string
    score: number
}

export class ProfileAnalyzer {
    tiktok: TikTok = new TikTok(ANALYZER_MS_TOKEN)
    isAnalyzing = false

    constructor(private redis: Redis) {}

    async getTaggedComments(
        username: string
    ): Promise<[TaggedComment[], TaggingStatus]> {
        const comments = await this.redis.get(taggedCommentsKey(username))
        const status =
            (await this.redis.get(taggingStatusKey(username))) ||
            TaggingStatus.Pending
        if (comments) {
            return [JSON.parse(comments), status as TaggingStatus]
        }

        return [[], status as TaggingStatus]
    }

    async waitUntilAvailable() {
        while (this.isAnalyzing) {
            await sleep(5000)
        }
    }

    async analyze(username: string) {
        try {
            await this.waitUntilAvailable()

            if (!this.tiktok.initialized) {
                await this.tiktok.init()
            }

            const user = await this.tiktok.getUser(username)
            const status = await this.redis.get(taggingStatusKey(username))

            // Don't analyze if already in progress
            if (status === TaggingStatus.InProgress) {
                return
            }

            console.log(`Analyzer: Analyzing ${username}`)

            this.isAnalyzing = true

            await this.redis.set(
                taggingStatusKey(username),
                TaggingStatus.InProgress
            )

            const videos = await this.tiktok.getVideos(
                user,
                MAX_VIDEOS_PER_USER
            )

            console.log(`Analyzer: Loading classifier`)

            let classifier = await pipeline("sentiment-analysis")
            const taggedComments = new Array<TaggedComment>()

            for (const video of videos) {
                console.log(`Analyzer: Analyzing video ${video.id}`)

                let comments = await this.tiktok.getComments(
                    video,
                    MAX_COMMENTS_PER_VIDEO
                )

                // Only use english comments
                comments = comments.filter((c) => c.language === "en")

                console.log(`Analyzer: Tagging ${comments.length} comments`)

                for (const comment of comments) {
                    const commentTag = await classifier(comment.text)

                    taggedComments.push({
                        comment,
                        label: commentTag[0].label,
                        score: commentTag[0].score,
                    })
                }

                console.log(`Analyzer: Updating tagging state`)

                await this.redis.set(
                    taggedCommentsKey(username),
                    JSON.stringify(taggedComments),
                    "EX",
                    PROFILE_ANALYSIS_EXPIRATION
                )
            }

            await this.redis.set(taggingStatusKey(username), TaggingStatus.Done)

            this.isAnalyzing = false
            // Sort comments by creation time ascending
            // comments = comments.sort((a, b) => a.createTime - b.createTime)

            console.log(`Analyzer: Done analyzing ${username}`)
        } catch (e) {
            console.log(`Analyzer: Got error while analyzing ${username}`, e)

            this.isAnalyzing = false

            await this.redis.set(
                taggingStatusKey(username),
                TaggingStatus.Error
            )
        }
    }
}

function taggedCommentsKey(username: string) {
    return `tagged-comments:${username}`
}

function taggingStatusKey(username: string) {
    return `tagging-status:${username}`
}
