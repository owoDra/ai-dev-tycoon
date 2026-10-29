import type { SceneId } from './timeline';

/**
 * ナレーション（VOICEVOX のずんだもん）。text は読み上げる文で、英語は読み方をカタカナで書く。
 * delay は場面の頭から話し始めるまでの秒数。変えたら `npm run capture:voice` で作り直す
 */
export const narration: Readonly<Record<SceneId, { readonly text: string; readonly delay: number }>> = {
  title: { text: 'エーアイ業務改善タイクーン！人間を、人間にしかできない仕事へ、なのだ！', delay: 0.8 },
  assign: {
    text: 'この仕事、だれに任せる？人間か、エーアイか、エーアイが作って人間がレビューするか。選ぶのはキミなのだ。',
    delay: 0.4,
  },
  trouble: { text: 'エーアイは速いけど、事件も起きるのだ！ボトルネックも、どんどん動くのだ。', delay: 0.4 },
  delivered: { text: 'スコアは、一人あたりの利益。同じ人数でも、エーアイの使い方で結果が変わるのだ。', delay: 0.4 },
  harness: { text: 'スキルに、フックに、イーバル。エーアイに仕組みを付けて、ミスを途中で止めるのだ。', delay: 0.5 },
  bring: {
    text: '自分のクロードコードの設定を読み込むと、ゲームのカードになるのだ。同じ合言葉で、みんなと利益を競うのだ！',
    delay: 0.4,
  },
  facts: { text: 'ちなみにこのゲーム、音もキャラも、ぜんぶコードで作ってるのだ。HTML一枚、2メガなのだ！', delay: 0.3 },
  end: { text: 'スマホでもピーシーでも、開くだけで遊べるのだ。いますぐ、遊んでほしいのだ！', delay: 0.6 },
};

/** VOICEVOX の話者（ずんだもん・ノーマル） */
export const VOICE_SPEAKER = 3;
