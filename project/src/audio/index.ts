import { createAudioEngine } from './engine';

/**
 * アプリ全体で1つのオーディオエンジン。AudioContext は最初のユーザー操作（unlock）まで作らないので、
 * import しただけでは音は鳴らず、テストや音の出ない環境でもそのまま動く。
 */
export const audio = createAudioEngine();
