import type { IndradhanuApi } from "./types"
import { mockClient } from "./mock/mockClient"

/** Swap point. When the FastAPI backend is up, add an httpClient that
 *  implements IndradhanuApi and select it here — nothing else changes. */
const MODE = (import.meta.env.VITE_API_MODE as string) ?? "mock"

export const api: IndradhanuApi = mockClient

export const apiMode = MODE
