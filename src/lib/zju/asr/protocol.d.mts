export const BYTES_PER_SECOND: number;
export const PCM_FORMAT: Readonly<{format: string; codec: string; rate: number; bits: number; channel: number}>;
export function encodeRequest(payload: unknown, options?: {audio?: boolean; last?: boolean}): Buffer;
export function decodeResponse(data: Buffer | Uint8Array): {type: number; flags: number; sequence?: number; errorCode?: number; body: unknown; final: boolean};
export function extractResult(body: unknown): unknown;
