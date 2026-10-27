import { balance } from '../content/balance';
import { companyTiers } from '../content/companyTiers';
import { content } from '../content/index';
import type { CompanyTierId } from '../content/types';
import { ByteReader, ByteWriter, crc16, openCode, sealCode } from '../lib/codec';
import { RESULT_CODE_FORMAT } from './serialize';

/*
 * 結果コード（企画書28章「同じ Claude を使ったのに、なぜ結果が違ったのか」を比べるためのスコアの書き出し）。
 * 案件1件の主要指標を、読み上げやすい短い英数字にする。インターネットには接続せず、コピーか QR コードで渡す。
 * 中身は [形式のバージョン, ビルドの指紋, seed, 案件の並び順, 指標..., ランク] で、チェックサムと Base32 は lib/codec.ts が受け持つ。
 */

/** 形式のバージョン（数値は形式のバージョンをまとめている core/serialize.ts に置く） */
export const RESULT_CODE_VERSION = RESULT_CODE_FORMAT;

/** 結果のランク（view/rank.ts の Rank と同じ） */
export type ResultRank = 'S' | 'A' | 'B' | 'C';

/** 結果コードに入れる値。金額は円、時間はゲーム内の分（どれも整数に丸める） */
export interface ResultRecord {
  /** ゲームを始めた seed。同じ seed どうしなら、同じ案件・社員・事件の条件で比べられる */
  readonly seed: string;
  readonly projectId: string;
  readonly profit: number;
  readonly profitPerPersonDay: number;
  readonly humanMinutes: number;
  readonly aiCost: number;
  /** 品質（0〜1）。コードには 0.1% 単位で入れる */
  readonly quality: number;
  /** 案件開始から納品までの時間 */
  readonly elapsedMinutes: number;
  readonly rank: ResultRank;
}

export type DecodeError =
  /** 使えない文字・長さが足りない・中身が壊れている */
  | 'format'
  /** チェックサムが合わない（写し間違い・改ざん） */
  | 'checksum'
  /** 別の形式のバージョンで作られた */
  | 'version';

export type DecodeResult =
  | {
      readonly ok: true;
      readonly record: ResultRecord;
      /** 同じ内容（案件・バランス）のビルドで遊んだ結果か。違えば数字をそのまま比べられない */
      readonly sameBuild: boolean;
    }
  | { readonly ok: false; readonly error: DecodeError };

const RANKS: readonly ResultRank[] = ['S', 'A', 'B', 'C'];

export interface EncodeOptions {
  /** 形式のバージョン（テストで別のバージョンのコードを作るため） */
  readonly version?: number;
  /** ビルドの指紋（テストで別のビルドのコードを作るため） */
  readonly build?: number;
}

/** 結果を結果コードにする */
export function encodeResultCode(record: ResultRecord, options: EncodeOptions = {}): string {
  const w = new ByteWriter()
    .byte(options.version ?? RESULT_CODE_VERSION)
    .u16(options.build ?? buildFingerprint())
    .text(record.seed)
    .uint(content.projects.findIndex((p) => p.id === record.projectId))
    .int(record.profit)
    .int(record.profitPerPersonDay)
    .uint(record.humanMinutes)
    .uint(record.aiCost)
    .ratio(record.quality)
    .uint(record.elapsedMinutes)
    .byte(RANKS.indexOf(record.rank));
  return sealCode(w.bytes);
}

/** 結果コードを読む。区切り・空白・小文字は無視し、紛らわしい文字は読み替える */
export function decodeResultCode(code: string): DecodeResult {
  const opened = openCode(code);
  if (!opened.ok) return opened;
  try {
    const r = new ByteReader(opened.bytes);
    if (r.byte() !== RESULT_CODE_VERSION) return { ok: false, error: 'version' };
    const build = r.u16();
    const record: ResultRecord = {
      seed: r.text(),
      projectId: projectAt(r.uint()),
      profit: r.int(),
      profitPerPersonDay: r.int(),
      humanMinutes: r.uint(),
      aiCost: r.uint(),
      quality: r.ratio(),
      elapsedMinutes: r.uint(),
      rank: rankAt(r.byte()),
    };
    if (!r.done()) return { ok: false, error: 'format' };
    return { ok: true, record, sameBuild: build === buildFingerprint() };
  } catch {
    return { ok: false, error: 'format' };
  }
}

/** 案件はデータの並び順で書く（コードを短くするため。並びの違うビルドはビルドの指紋で見分ける） */
function projectAt(i: number): string {
  const project = content.projects[i];
  if (!project) throw new RangeError(`不正な案件 ${i}`);
  return project.id;
}

function rankAt(i: number): ResultRank {
  const rank = RANKS[i];
  if (!rank) throw new RangeError(`不正なランク ${i}`);
  return rank;
}

let fingerprint: number | undefined;

/**
 * ビルドの指紋。案件・社員・Harness 部品などのデータとバランス値から作る 16 ビットの値で、
 * 結果に影響する内容が違う HTML で遊んだ結果を見分ける
 */
export function buildFingerprint(): number {
  fingerprint ??= crc16(new TextEncoder().encode(JSON.stringify({ balance, content })));
  return fingerprint;
}

/*
 * 決算の結果コード。会社の1期の主要な数字を、案件の結果コードと同じ仕組み（lib/codec.ts）で短い英数字にする。
 * 中身は [印 'F', 形式のバージョン, ビルドの指紋, seed, 期, 売上, 利益, 利益 / 人日, 人間の時間, 納品数, 評判, 規模, 格付け, 時価総額]
 */

/** 案件の結果コードと見分けるための先頭の印（'F'） */
const FISCAL_CODE_MAGIC = 'F'.charCodeAt(0);
export const FISCAL_CODE_VERSION = 1;

/** 決算の結果コードに入れる値。金額は円、時間はゲーム内の分（どれも整数に丸める） */
export interface FiscalRecord {
  readonly seed: string;
  /** 期の番号（1 から） */
  readonly no: number;
  readonly revenue: number;
  readonly profit: number;
  readonly profitPerPersonDay: number;
  readonly humanMinutes: number;
  readonly delivered: number;
  readonly reputation: number;
  readonly tier: CompanyTierId;
  readonly rank: number;
  readonly valuation: number;
}

export type FiscalDecodeResult =
  | { readonly ok: true; readonly record: FiscalRecord; readonly sameBuild: boolean }
  | { readonly ok: false; readonly error: DecodeError };

export function encodeFiscalCode(record: FiscalRecord, options: EncodeOptions = {}): string {
  const w = new ByteWriter()
    .byte(FISCAL_CODE_MAGIC)
    .byte(options.version ?? FISCAL_CODE_VERSION)
    .u16(options.build ?? buildFingerprint())
    .text(record.seed)
    .uint(record.no)
    .uint(record.revenue)
    .int(record.profit)
    .int(record.profitPerPersonDay)
    .uint(record.humanMinutes)
    .uint(record.delivered)
    .uint(record.reputation)
    .uint(companyTiers.findIndex((t) => t.id === record.tier))
    .uint(record.rank)
    .uint(record.valuation);
  return sealCode(w.bytes);
}

export function decodeFiscalCode(code: string): FiscalDecodeResult {
  const opened = openCode(code);
  if (!opened.ok) return opened;
  try {
    const r = new ByteReader(opened.bytes);
    if (r.byte() !== FISCAL_CODE_MAGIC) return { ok: false, error: 'format' };
    if (r.byte() !== FISCAL_CODE_VERSION) return { ok: false, error: 'version' };
    const build = r.u16();
    const record: FiscalRecord = {
      seed: r.text(),
      no: r.uint(),
      revenue: r.uint(),
      profit: r.int(),
      profitPerPersonDay: r.int(),
      humanMinutes: r.uint(),
      delivered: r.uint(),
      reputation: r.uint(),
      tier: tierAt(r.uint()),
      rank: r.uint(),
      valuation: r.uint(),
    };
    if (!r.done()) return { ok: false, error: 'format' };
    return { ok: true, record, sameBuild: build === buildFingerprint() };
  } catch {
    return { ok: false, error: 'format' };
  }
}

function tierAt(i: number): CompanyTierId {
  const tier = companyTiers[i];
  if (!tier) throw new RangeError(`不正な規模 ${i}`);
  return tier.id;
}
