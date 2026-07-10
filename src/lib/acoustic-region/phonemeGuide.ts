export interface PhonemeGuideEntry {
  label: string;
  hint: string;
  audioExample?: string;
}

export const PHONEME_GUIDE: Record<string, PhonemeGuideEntry> = {
  // 母音
  "a": { label: "ア", hint: "日本語の「ア」でよい", audioExample: "ㅏ.mp3" },
  "ɛ": { label: "広いエ", hint: "「エ」より口を開く（現代ソウルでは e とほぼ区別されない）", audioExample: "ㅐ.mp3" },
  "e": { label: "エ", hint: "日本語の「エ」に近い", audioExample: "ㅔ.mp3" },
  "ʌ": { label: "唇を丸めないオ", hint: "喉の奥で出す「ア寄りのオ」。日本語のオと同じと思わないこと", audioExample: "ㅓ.mp3" },
  "o": { label: "丸めたオ", hint: "唇をしっかり丸める。ʌ との違いは唇の丸め", audioExample: "ㅗ.mp3" },
  "u": { label: "丸めたウ", hint: "日本語のウより唇を強く丸める", audioExample: "ㅜ.mp3" },
  "ɯ": { label: "丸めないウ", hint: "「イ」の口の形のまま「ウ」と言う", audioExample: "ㅡ.mp3" },
  "i": { label: "イ", hint: "日本語の「イ」でよい", audioExample: "ㅣ.mp3" },
  "j": { label: "ヤ行の出だし", hint: "わたり音。単独では出ず、次の母音とセット", audioExample: "ㅑ.mp3" },
  "w": { label: "ワ行の出だし", hint: "わたり音。唇を丸めてすぐ次の母音へ", audioExample: "ㅘ.mp3" },
  "ɰ": { label: "丸めないw", hint: "わたり音。ㅢ の出だし。唇を丸めない", audioExample: "ㅢ.mp3" },

  // 子音
  "k": { label: "平音カ行", hint: "息は弱く低いピッチで始まる。語中では濁ってガ行寄りに聞こえる" },
  "t": { label: "平音タ行", hint: "同上の性質。語中ではダ行寄り" },
  "p": { label: "平音パ行", hint: "同上。語中ではバ行寄り" },
  "s": { label: "サ行", hint: "平音のs" },
  "tɕ": { label: "平音チャ行", hint: "語中ではヂャ寄り" },
  "h": { label: "ハ行", hint: "語中では弱まってほぼ聞こえないことがある" },
  "n": { label: "ナ行のn", hint: "語頭では鼻音性が弱く「ダ」寄りに聞こえることがある" },
  "m": { label: "マ行のm", hint: "語頭では「バ」寄りに聞こえることがある" },
  "ɾ": { label: "弾くラ行", hint: "日本語のラ行とほぼ同じ" },
  "kʰ": { label: "激音カ行", hint: "強い息。高いピッチで始まる — 「高く始まる」で聞き分ける" },
  "tʰ": { label: "激音タ行", hint: "同上" },
  "pʰ": { label: "激音パ行", hint: "同上" },
  "tɕʰ": { label: "激音チャ行", hint: "同上" },
  "k͈": { label: "濃音カ行", hint: "息なし。喉を締めた詰まる音。「っか」の後半に近い" },
  "t͈": { label: "濃音タ行", hint: "同上。「った」の後半" },
  "p͈": { label: "濃音パ行", hint: "同上。「っぱ」の後半" },
  "s͈": { label: "濃音サ行", hint: "同上。「っさ」の後半" },
  "tɕ͈": { label: "濃音チャ行", hint: "同上" },
  "l": { label: "終声のl", hint: "舌先を上につけたまま終わる。ㄹㄹ連続のときもこれ" },
  "ŋ": { label: "終声の鼻音(奥)", hint: "舌の奥で閉じ、口は開いたまま鼻に抜ける。n との違いは閉じる場所" },
  "k̚": { label: "終声のk", hint: "破裂させず飲み込んで止めるk" },
  "t̚": { label: "終声のt", hint: "舌先で止めて破裂させない" },
  "p̚": { label: "終声のp", hint: "唇で止めて破裂させない" }
};
