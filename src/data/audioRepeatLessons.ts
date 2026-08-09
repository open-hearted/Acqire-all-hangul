export interface AudioRepeatLesson {
  characters: string[];
  words: string[];
}

/** 教材の掲載順。音声ファイルの並び順には依存させない。 */
export const AUDIO_REPEAT_LESSONS: Record<string, AudioRepeatLesson> = {
  CD12: {
    characters: ["자", "쟈", "저", "져", "조", "죠", "주", "쥬", "즈", "지"],
    words: ["여자", "아버지", "지구", "저고리"],
  },
  CD13: {
    characters: ["하", "햐", "허", "혀", "호", "효", "후", "휴", "흐", "히"],
    words: ["오후", "허리", "휴지", "흐리다"],
  },
};
