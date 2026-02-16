import type { BilingualEntry } from "@/types/bilingual";

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function buildBilingualText(entries: BilingualEntry[]): string {
  return entries
    .filter((e) => e.isFinal && e.originalText.trim())
    .map((e) => {
      const speaker = e.speakerLabel ? `[${e.speakerLabel}]` : "";
      const time = `(${formatTime(e.startMs)})`;
      const header = [speaker, time].filter(Boolean).join(" ");

      const zhLine =
        e.language === "zh"
          ? `中: ${e.originalText}`
          : `中: ${e.translatedText}`;
      const enLine =
        e.language === "en"
          ? `EN: ${e.originalText}`
          : `EN: ${e.translatedText}`;

      return `${header}\n${zhLine}\n${enLine}\n---`;
    })
    .join("\n\n");
}

export function triggerBilingualDownload(entries: BilingualEntry[]): void {
  if (entries.length === 0) return;

  const content = buildBilingualText(entries);
  const now = new Date();
  const filename = `bilingual-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}.txt`;

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
