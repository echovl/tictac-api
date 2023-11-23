import { Browser, Page } from "puppeteer"
import puppeteer from "puppeteer-extra"
import stealth from "puppeteer-extra-plugin-stealth"

const TikTokErrNotInitialized = new Error("TikTok not initialized")
const TikTokErrEmptyResponse = new Error("TikTok returned an empty response")
const TikTokErrUnexpected = new Error("TikTok returned an error")

export type TiktokUser = {
    id: string
    secUid: string
    username: string
    nickname: string
    signature: string
    verified: boolean
    followerCount: number
    videoCount: number
    avatarLarge: string
    avatarMedium: string
    avatarThumb: string
}

export type TiktokUserHit = {
    id: string
    secUid: string
    username: string
    nickname: string
    signature: string
    verified: boolean
    followerCount: number
    avatarThumb: string
}

export type TiktokVideo = {
    id: string
    text: string
    cover: string
    createTime: number
    diggCount: number
    shareCount: number
    playCount: number
    commentCount: number
    comments?: Array<TikTokComment>
}

export type TikTokComment = {
    id: string
    text: string
    createTime: number
    diggCount: number
    language: string
    authorName: string
    authorAvatar: string
}

export class TikTok {
    headers: Record<string, string> = {}
    commonUrlParams: Record<string, string> = {}
    msToken?: string
    session?: Page
    browser?: Browser
    initialized: boolean = false

    constructor(msToken?: string) {
        this.msToken = msToken
    }

    async init() {
        // Bypass TikTok's bot detection
        puppeteer.use(stealth())

        const browser = await puppeteer.launch({
            headless: "new",
            args: ["--no-sandbox", "--incognito"],
        })
        const session = await browser.newPage()

        // Get headers from the first request
        let headers = {}
        session.once("request", (req) => (headers = req.headers()))
        await session.goto("https://www.tiktok.com")

        if (!this.msToken) {
            // Extract msToken from cookies
            await sleep(1000)
            const cookies = await session.cookies()
            const msTokenCookie = cookies.find(
                (cookie) => cookie.name === "msToken"
            )
            if (!msTokenCookie) {
                throw new Error("msToken cookie not found")
            }
            this.msToken = msTokenCookie.value
        } else {
            this.session?.setCookie({
                name: "msToken",
                value: this.msToken || "",
                domain: new URL("https://www.tiktok.com").hostname,
                path: "/",
            })
        }

        // Evaluate common URL parameters
        // @ts-ignore
        const userAgent = await session.evaluate(() => navigator.userAgent)
        const language = await session.evaluate(
            // @ts-ignore
            (): string => navigator.language || navigator.userLanguage
        )
        // @ts-ignore
        const platform = await session.evaluate(() => navigator.platform)
        const deviceId = random(10 ** 18, 10 ** 19).toString()
        const historyLen = random(1, 10).toString()
        const screenHeight = random(600, 1080).toString()
        const screenWidth = random(800, 1920).toString()
        const timezone = await session.evaluate(
            () => Intl.DateTimeFormat().resolvedOptions().timeZone
        )

        this.initialized = true
        this.browser = browser
        this.session = session
        this.headers = headers
        this.commonUrlParams = {
            aid: "1988",
            app_language: language,
            app_name: "tiktok_web",
            browser_language: language,
            browser_name: "Mozilla",
            browser_online: "true",
            browser_platform: platform,
            browser_version: userAgent,
            channel: "tiktok_web",
            cookie_enabled: "true",
            device_id: deviceId,
            device_platform: "web_pc",
            focus_state: "true",
            from_page: "user",
            history_len: historyLen,
            is_fullscreen: "false",
            is_page_visible: "true",
            language: language,
            os: platform,
            priority_region: "",
            referer: "",
            region: "US",
            screen_height: screenHeight,
            screen_width: screenWidth,
            tz_name: timezone,
            webcast_language: language,
        }
    }

    async close() {
        if (!this.session || !this.browser) {
            throw TikTokErrNotInitialized
        }
        await this.browser.close()
    }

    async searchUsers(searchTerm: string): Promise<Array<TiktokUserHit>> {
        const url = new URL("https://www.tiktok.com/api/search/user/full/")

        url.searchParams.append("keyword", searchTerm)
        url.searchParams.append("cursor", "0")
        url.searchParams.append("from_page", "search")
        url.searchParams.append(
            "web_search_code",
            `{"tiktok":{"client_params_x":{"search_engine":{"ies_mt_user_live_video_card_use_libra":1,"mt_search_general_user_live_card":1}},"search_server":{}}}`
        )
        url.searchParams.append("msToken", this.msToken || "")

        for (const [key, value] of Object.entries(this.commonUrlParams)) {
            url.searchParams.append(key, value as string)
        }

        const userInfo = await this.makeRequest(url)

        return userInfo.user_list.map((user: any) => ({
            id: user.user_info.uid,
            secUid: user.user_info.sec_uid,
            username: user.user_info.unique_id,
            nickname: user.user_info.nickname,
            signature: user.user_info.signature,
            verified: user.user_info.enterprise_verify_reason !== "" || user.user_info.custom_verify !== "",
            followerCount: user.user_info.follower_count,
            avatarThumb: user.user_info.avatar_thumb.url_list[0],
        }))
    }

    async getUser(username: string): Promise<TiktokUser> {
        const url = new URL("https://www.tiktok.com/api/user/detail/")

        url.searchParams.append("uniqueId", username)
        url.searchParams.append("secUid", "")
        url.searchParams.append("msToken", this.msToken || "")

        for (const [key, value] of Object.entries(this.commonUrlParams)) {
            url.searchParams.append(key, value as string)
        }

        const userInfo = await this.makeRequest(url)

        return {
            id: userInfo.userInfo.user.id,
            secUid: userInfo.userInfo.user.secUid,
            username: userInfo.userInfo.user.uniqueId,
            nickname: userInfo.userInfo.user.nickname,
            signature: userInfo.userInfo.user.signature,
            verified: userInfo.userInfo.user.verified,
            followerCount: userInfo.userInfo.stats.followerCount,
            videoCount: userInfo.userInfo.stats.videoCount,
            avatarLarge: userInfo.userInfo.user.avatarLarger,
            avatarMedium: userInfo.userInfo.user.avatarMedium,
            avatarThumb: userInfo.userInfo.user.avatarThumb,
        }
    }

    async getVideos(
        user: TiktokUser,
        count?: number
    ): Promise<Array<TiktokVideo>> {
        const videos = new Array<TiktokVideo>()
        let cursor = "0"
        let found = 0

        while (true) {
            const url = new URL("https://www.tiktok.com/api/post/item_list/")

            url.searchParams.append("secUid", user.secUid)
            url.searchParams.append("count", "35")
            url.searchParams.append("cursor", cursor)
            url.searchParams.append("msToken", this.msToken || "")

            for (const [key, value] of Object.entries(this.commonUrlParams)) {
                url.searchParams.append(key, value as string)
            }

            const response = await this.makeRequest(url)

            for (const video of response.itemList) {
                found++
                videos.push({
                    id: video.id,
                    text: video.desc,
                    cover: video.video.cover,
                    createTime: video.createTime,
                    diggCount: video.stats.diggCount,
                    shareCount: video.stats.shareCount,
                    playCount: video.stats.playCount,
                    commentCount: video.stats.commentCount,
                })
                if (count && found == count) {
                    return videos
                }
            }

            if (!response.hasMore) {
                break
            }

            cursor = response.cursor
        }

        return videos
    }

    async getComments(
        video: TiktokVideo,
        count?: number
    ): Promise<Array<TikTokComment>> {
        const comments = new Array<TikTokComment>()
        let cursor = "0"
        let found = 0

        while (true) {
            const url = new URL("https://www.tiktok.com/api/comment/list/")

            url.searchParams.append("aweme_id", video.id)
            url.searchParams.append("count", "20")
            url.searchParams.append("cursor", cursor)
            url.searchParams.append("msToken", this.msToken || "")

            for (const [key, value] of Object.entries(this.commonUrlParams)) {
                url.searchParams.append(key, value as string)
            }

            const response = await this.makeRequest(url)

            if (response.comments) {
                for (const comment of response.comments) {
                    found++
                    comments.push({
                        id: comment.cid,
                        text: comment.text,
                        createTime: comment.create_time,
                        diggCount: comment.digg_count,
                        language: comment.comment_language,
                        authorName: comment.user.nickname,
                        authorAvatar: comment.user.avatar_thumb.url_list[0],
                    })

                    if (count && found == count) {
                        return comments
                    }
                }
            }

            if (!response.has_more) {
                break
            }

            cursor = response.cursor
        }

        return comments
    }

    private async makeRequest(
        url: URL,
        retries: number = 3
    ): Promise<Record<string, any>> {
        if (!this.session) {
            throw TikTokErrNotInitialized
        }

        await this.session.waitForFunction(
            "window.byted_acrawler !== undefined"
        )

        const { "X-Bogus": xBogus } = await this.session.evaluate(
            (url) =>
                // @ts-ignore
                window.byted_acrawler.frontierSign(url),
            url.toString()
        )
        url.searchParams.set("X-Bogus", xBogus)

        let retryCount = 0
        while (true) {
            try {
                console.log("makeRequest", url.toString(), this.headers)

                const response = await this.session.evaluate(
                    (url, headers) => {
                        return new Promise<string>((resolve, reject) => {
                            fetch(url, { method: "GET", headers })
                                .then((response) => response.text())
                                .then((data) => resolve(data))
                                .catch((error) => reject(error.message))
                        })
                    },
                    url.toString(),
                    this.headers
                )

                if (!response || response == "") {
                    throw TikTokErrEmptyResponse
                }

                const json = JSON.parse(response)
                if (json.status_code !== 0) {
                    console.log(json)
                    throw TikTokErrUnexpected
                }

                return json
            } catch (error) {
                retryCount++
                if (retries > retryCount) {
                    throw error
                }

                // Exponential backoff
                await sleep(500 * 2 ** retryCount)
            }
        }
    }
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function random(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}
