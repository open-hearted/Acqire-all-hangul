# ハングル習得クイズ / 한글 퀴즈 / Hangul Quiz

Mobile-first web app for practising Hangul characters by listening to audio clips and typing the answer.

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

- Presents all 10 basic Hangul vowels (ㅏ ㅑ ㅓ ㅕ ㅗ ㅛ ㅜ ㅠ ㅡ ㅣ) in randomized order
- Shuffle on every Start / Reset so each session is different
- Play the audio for each question with a single tap
- Type the answer using any keyboard (including OS handwriting keyboard)
- Immediate correct / incorrect feedback
- Progress **and** shuffled order persisted in **localStorage** — reload resumes the same sequence
- Mobile-first responsive design

---

## 📝 License

Private repository.
