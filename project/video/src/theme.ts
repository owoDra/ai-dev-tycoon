/** ゲームのデザイントークン（src/styles/tokens.css）から、動画で使う色と字形を写したもの */
export const color = {
  bg: '#fff4e8',
  surface: '#ffffff',
  ink: '#2a1b3d',
  inkMuted: '#5f4d73',
  primary: '#ff4f8b',
  primarySoft: '#ffdce8',
  accent: '#ffd23f',
  accentSoft: '#fff6d9',
  success: '#22c77a',
  successSoft: '#d3f4e4',
  warning: '#ffa928',
  danger: '#ff4d5e',
  tile: '#ffe8cc',
} as const;

export const font = '"Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", sans-serif';

export const FPS = 30;
/** 秒をフレーム数にする */
export const sec = (s: number) => Math.round(s * FPS);
