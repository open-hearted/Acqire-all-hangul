import { readdir } from "node:fs/promises";
import path from "node:path";
import AudioRepeatPlayer, { type AudioGroup } from "./AudioRepeatPlayer";

export const metadata = {
  title: "韓国語音声リピート練習",
  description: "好きな韓国語音声を並べて繰り返し練習できます",
};

async function getAudioGroups(): Promise<AudioGroup[]> {
  const audioRoot = path.join(process.cwd(), "public", "audio");
  const entries = await readdir(audioRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());

  const groups = await Promise.all(
    directories.map(async (directory) => {
      const files = await readdir(path.join(audioRoot, directory.name), {
        withFileTypes: true,
      });
      return {
        name: directory.name,
        tracks: files
          .filter((file) => file.isFile() && /\.mp3$/i.test(file.name))
          .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }))
          .map((file) => ({
            id: `${directory.name}/${file.name}`,
            cd: directory.name,
            fileName: file.name,
            label: file.name.replace(/\.mp3$/i, "").replace(/^\d+[\s_-]*/, ""),
            src: `/audio/${encodeURIComponent(directory.name)}/${encodeURIComponent(file.name)}`,
          })),
      };
    }),
  );

  return groups
    .filter((group) => group.tracks.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export default async function AudioRepeatPage() {
  return <AudioRepeatPlayer groups={await getAudioGroups()} />;
}
