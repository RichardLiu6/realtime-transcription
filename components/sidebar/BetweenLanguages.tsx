"use client";

import { SONIOX_LANGUAGES } from "@/types/bilingual";

interface BetweenLanguagesProps {
  languageA: string;
  languageB: string;
  onLanguageAChange: (code: string) => void;
  onLanguageBChange: (code: string) => void;
  disabled?: boolean;
}

export default function BetweenLanguages({
  languageA,
  languageB,
  onLanguageAChange,
  onLanguageBChange,
  disabled,
}: BetweenLanguagesProps) {
  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
        Languages
      </p>

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs text-gray-400">Language A</label>
          <select
            value={languageA}
            onChange={(e) => onLanguageAChange(e.target.value)}
            disabled={disabled}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
          >
            {SONIOX_LANGUAGES.map((lang) => (
              <option
                key={lang.code}
                value={lang.code}
                disabled={lang.code === languageB}
              >
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-center">
          <span className="text-gray-300 text-lg">⇅</span>
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-400">Language B</label>
          <select
            value={languageB}
            onChange={(e) => onLanguageBChange(e.target.value)}
            disabled={disabled}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
          >
            {SONIOX_LANGUAGES.map((lang) => (
              <option
                key={lang.code}
                value={lang.code}
                disabled={lang.code === languageA}
              >
                {lang.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
