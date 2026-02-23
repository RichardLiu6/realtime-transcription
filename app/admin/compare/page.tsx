"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSonioxTranscription } from "@/hooks/useSonioxTranscription";
import { useSpeakerManager } from "@/hooks/useSpeakerManager";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic, Square } from "lucide-react";
import Link from "next/link";
import { SONIOX_LANGUAGES } from "@/types/bilingual";
import type { TranslationMode } from "@/types/bilingual";

const COMPARE_MODELS = [
  { id: "gpt-5-nano/minimal", label: "Nano (minimal)" },
  { id: "gpt-5-nano/low", label: "Nano (low)" },
  { id: "gpt-5-nano/medium", label: "Nano (medium)" },
  { id: "gpt-5-mini", label: "GPT-5 Mini" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
];

interface ModelResult {
  model: string;
  translatedText: string;
  latencyMs: number;
  status: "pending" | "done" | "error";
}

interface CompareRow {
  entryId: string;
  originalText: string;
  sourceLang: string;
  results: ModelResult[];
}

export default function ComparePage() {
  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    new Set(["gpt-5-nano/minimal"])
  );
  const [languageA, setLanguageA] = useState("*");
  const [languageB, setLanguageB] = useState("en");
  const [rows, setRows] = useState<CompareRow[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleModel = (id: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Translation callback: fire all selected models in parallel
  const onSegmentFinalized = useCallback(
    (entryId: string, text: string, sourceLang: string) => {
      const models = Array.from(selectedModels);
      if (models.length === 0) return;

      // Determine target language
      let targetLang = languageB;
      if (languageA !== "*" && sourceLang === languageB) {
        targetLang = languageA;
      }

      // Initialize row with pending results
      const pendingResults: ModelResult[] = models.map((m) => ({
        model: m,
        translatedText: "",
        latencyMs: 0,
        status: "pending",
      }));

      const newRow: CompareRow = {
        entryId,
        originalText: text,
        sourceLang,
        results: pendingResults,
      };

      setRows((prev) => [...prev, newRow]);

      // Fire parallel requests
      models.forEach((model) => {
        const start = Date.now();
        fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            sourceLang,
            targetLang,
            model,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            setRows((prev) =>
              prev.map((row) => {
                if (row.entryId !== entryId) return row;
                return {
                  ...row,
                  results: row.results.map((r) =>
                    r.model === model
                      ? {
                          ...r,
                          translatedText: data.translatedText || "",
                          latencyMs: Date.now() - start,
                          status: "done" as const,
                        }
                      : r
                  ),
                };
              })
            );
          })
          .catch(() => {
            setRows((prev) =>
              prev.map((row) => {
                if (row.entryId !== entryId) return row;
                return {
                  ...row,
                  results: row.results.map((r) =>
                    r.model === model
                      ? { ...r, status: "error" as const, latencyMs: Date.now() - start }
                      : r
                  ),
                };
              })
            );
          });
      });
    },
    [selectedModels, languageA, languageB]
  );

  const {
    entries,
    currentInterim,
    recordingState,
    start,
    stop,
    clearEntries,
  } = useSonioxTranscription({
    skipTranslation: true,
    onSegmentFinalized,
  });

  const { speakers, registerSpeaker, clearSpeakers } = useSpeakerManager();

  useEffect(() => {
    for (const entry of entries) {
      registerSpeaker(entry.speaker);
    }
  }, [entries, registerSpeaker]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [rows]);

  const handleStart = useCallback(() => {
    clearEntries();
    clearSpeakers();
    setRows([]);
    const langA = languageA === "*" ? ["*"] : [languageA];
    start({
      languageA: langA,
      languageB,
      contextTerms: [],
      translationMode: "two_way" as TranslationMode,
    });
  }, [languageA, languageB, start, clearEntries, clearSpeakers]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const isRecording = recordingState === "recording";
  const isConnecting = recordingState === "connecting";
  const activeModels = COMPARE_MODELS.filter((m) => selectedModels.has(m.id));

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">模型翻译对比</h1>
          <Link href="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4 mr-1" />
              返回管理
            </Button>
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div className="border-b border-border px-4 py-3 space-y-3">
        {/* Model checkboxes */}
        <div className="flex flex-wrap gap-2">
          {COMPARE_MODELS.map((m) => (
            <label
              key={m.id}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-pointer transition ${
                selectedModels.has(m.id)
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-border text-muted-foreground hover:border-gray-400"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedModels.has(m.id)}
                onChange={() => toggleModel(m.id)}
                className="sr-only"
              />
              {m.label}
            </label>
          ))}
        </div>

        {/* Language + record controls */}
        <div className="flex items-center gap-3">
          <select
            value={languageA}
            onChange={(e) => setLanguageA(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-sm"
            disabled={isRecording}
          >
            <option value="*">自动检测</option>
            {SONIOX_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">→</span>
          <select
            value={languageB}
            onChange={(e) => setLanguageB(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-sm"
            disabled={isRecording}
          >
            {SONIOX_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>

          {isRecording || isConnecting ? (
            <Button
              onClick={handleStop}
              variant="destructive"
              size="sm"
              disabled={isConnecting}
            >
              <Square className="size-3.5 mr-1" />
              {isConnecting ? "连接中..." : "停止"}
            </Button>
          ) : (
            <Button
              onClick={handleStart}
              size="sm"
              disabled={selectedModels.size === 0}
            >
              <Mic className="size-3.5 mr-1" />
              开始录音
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            已选 {selectedModels.size} 个模型
          </span>
        </div>
      </div>

      {/* Results table */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
            {isRecording ? "正在听..." : "开始录音后，翻译结果将在此显示"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">
                  #
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[200px]">
                  原文
                </th>
                {activeModels.map((m) => (
                  <th
                    key={m.id}
                    className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[200px]"
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, idx) => (
                <tr key={row.entryId} className="align-top">
                  <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <span className="inline-block mr-1 px-1.5 py-0.5 bg-gray-100 rounded-full text-xs text-gray-500">
                      {row.sourceLang.toUpperCase()}
                    </span>
                    <span>{row.originalText}</span>
                  </td>
                  {activeModels.map((m) => {
                    const r = row.results.find((r) => r.model === m.id);
                    if (!r) return <td key={m.id} className="px-3 py-2 text-gray-300">—</td>;
                    return (
                      <td key={m.id} className="px-3 py-2">
                        {r.status === "pending" && (
                          <span className="text-gray-300 animate-pulse">翻译中...</span>
                        )}
                        {r.status === "done" && (
                          <div>
                            <span>{r.translatedText}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {r.latencyMs}ms
                            </span>
                          </div>
                        )}
                        {r.status === "error" && (
                          <span className="text-destructive text-xs">失败</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Show interim text */}
        {currentInterim && (
          <div className="px-3 py-2 text-gray-400 italic text-sm">
            {currentInterim}
            <span className="ml-0.5 inline-block h-4 w-0.5 bg-gray-400 align-text-bottom animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
