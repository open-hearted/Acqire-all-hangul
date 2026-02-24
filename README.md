# ハングル習得クイズ / 한글 퀴즈 / Hangul Quiz

Mobile-first web app for practising Hangul characters by listening to audio clips and typing the answer.

---

## ⚙️ Configuring the answers

All 10 basic vowel answers are pre-configured in **`src/data/lessons.json`** (ㅏ ㅑ ㅓ ㅕ ㅗ ㅛ ㅜ ㅠ ㅡ ㅣ). To change an answer, edit the `answer` field for the relevant lesson in that file.

---

## 🚀 Local development

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Steps

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🏗️ Production build

```bash
npm run build
npm run start
```

---

## ☁️ Deploy to Vercel

### Option A – Vercel CLI

```bash
npm i -g vercel
vercel
```

Follow the prompts. Vercel will auto-detect Next.js and configure everything.

### Option B – Vercel Dashboard

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Vercel will detect Next.js automatically — click **Deploy**.

No additional environment variables are required.

### Audio files

The mp3 files are stored in `public/audio/` and served as static assets by Next.js.  
Vercel serves them from its CDN automatically — no additional configuration needed.

---

## 📁 Project structure

```
.
├── public/
│   └── audio/          # Lesson001-01.mp3 … Lesson001-10.mp3
├── src/
│   ├── app/
│   │   ├── globals.css # Mobile-first styles
│   │   ├── layout.tsx  # Root layout
│   │   └── page.tsx    # Quiz page (main UI)
│   └── data/
│       └── lessons.json # ← Edit this to add correct answers
├── next.config.js
├── package.json
└── tsconfig.json
```

---

## 🗂️ Features

- Presents all 10 lessons in randomised order (shuffled on each start/reshuffle)
- Play the audio for each question with a single tap
- Type the answer using any keyboard (including OS handwriting keyboard)
- Immediate correct / incorrect feedback
- Progress and shuffled order persisted in **localStorage** — resume where you left off
- Start / リシャッフル control

---

## 📝 License

Private repository.
