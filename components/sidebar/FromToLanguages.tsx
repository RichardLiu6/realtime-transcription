"use client";

import { SONIOX_LANGUAGES } from "@/types/bilingual";

interface FromToLanguagesProps {
  languageA: string;
  languageB: string;
  onLanguageAChange: (code: string) => void;
  onLanguageBChange: (code: string) => void;
  disabled?: boolean;
}

export default function FromToLanguages({
  languageA,
  languageB,
  onLanguageAChange,
  onLanguageBChange,
  disabled,
}: FromToLanguagesProps) {
  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
        Languages
      </p>

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs text-gray-400">
            Source Language
          </label>
          <select
            value={languageA}
            onChange={(e) => onLanguageAChange(e.target.value)}
            disabled={disabled}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
          >
            <option value="*">Any Language (Auto)</option>
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
          <svg
            className="h-4 w-4 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-400">
            Target Language
          </label>
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
