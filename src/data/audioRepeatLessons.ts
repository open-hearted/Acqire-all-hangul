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
  CD14: {
    characters: ["차", "챠", "처", "쳐", "초", "쵸", "추", "츄", "츠", "치"],
    words: ["고추", "차", "치마", "처녀"],
  },
  CD15: {
    characters: ["카", "캬", "커", "켜", "코", "쿄", "쿠", "큐", "크", "키"],
    words: ["쿠키", "카지노", "오쿠보", "코"],
  },
  CD16: {
    characters: ["타", "탸", "터", "텨", "토", "툐", "투", "튜", "트", "티"],
    words: ["도토리", "노트", "토스트", "투수"],
  },
  CD17: {
    characters: ["파", "퍄", "퍼", "펴", "포", "표", "푸", "퓨", "프", "피"],
    words: ["피자", "커피", "아파트", "파"],
  },
};
