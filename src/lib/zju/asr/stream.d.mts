export type AsrResult = { text?: string; utterances?: { text: string; start_time?: number; end_time?: number; definite?: boolean }[] };
export type AsrEvent = { type: string; session?: number; offsetMs?: number; audioSentMs?: number; final?: boolean; result?: AsrResult; error?: string; discontinuity?: boolean };
export type AsrOptions = { apiKey: string; signal?: AbortSignal; audio?: AsyncIterable<Buffer>; url?: string; resolveUrl?: () => Promise<string>; duration?: number; sessionSeconds?: number; chunkMs?: number; realtime?: boolean; request?: Record<string, unknown>; uid?: string; resourceId?: string; audioTimeoutMs?: number; retryDelayMs?: number; retries?: number; inputHeaders?: Record<string,string>; inputArgs?: string[]; ffmpegPath?: string };
export function transcribeLive(options: AsrOptions): AsyncGenerator<AsrEvent>;
export function recognizePcm(audio: AsyncIterable<Buffer>, options: AsrOptions): AsyncGenerator<AsrEvent>;
export function pcmFrames(audio: AsyncIterable<Buffer>, options?: {chunkMs?:number;duration?:number}): AsyncGenerator<Buffer>;
export function redactError(error: unknown, secrets?: string[]): string;

export function createFfmpegAudio(url: string, options?: Partial<AsrOptions>): {audio: AsyncIterable<Buffer>; stop: () => Promise<void>};
