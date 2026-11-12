// What the AI endpoints answer (server/src/ai.ts); AiAdvisor.kt returns the same shapes on Android.
import type { Programme } from './guide.ts'
import type { Media, Provider } from './model.ts'

/** A real TMDB title the AI picked, why, and which of the user's subscriptions include it. */
export type AiResult = { media: Media; reason: string; providers: Provider[] }
/** A programme on free TV tonight, with its TMDB entry when recognized. */
export type AiTvResult = { programme: Programme; media: Media | null; reason: string }
/** A short reply, the titles, and optionally a question with quick answers ("Ritrova un titolo"). */
export type AiAnswer = { intro: string; results: AiResult[]; tv?: AiTvResult[]; question?: string; options?: string[] }
/** "Ti piacerà?": how well a title fits the user's taste. */
export type AiVerdict = { score: number; verdict: string; pros: string[]; cons: string[] }
