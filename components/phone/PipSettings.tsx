"use client";

// 悬浮字幕 settings (iOS app): the floating window's text size and how much
// of it the original takes; applied to an open window at once.

import { useT } from "@/lib/i18n";
import { setPipPrefs, usePipPrefs, type PipPrefs } from "@/lib/native/pip";
import { Choice } from "./parts";

export default function PipSettings() {
  const t = useT();
  const prefs = usePipPrefs();
  return (
    <div>
      <p className="pb-1 text-sm text-gray-600">{t("ph_pip_settings_desc")}</p>
      <Choice
        label={t("ph_pip_font")}
        value={String(prefs.fontSize)}
        options={([0, 1, 2, 3] as const).map((v) => ({ value: String(v), label: t(`ph_pip_font_${v}`) }))}
        onChange={(v) => setPipPrefs({ ...prefs, fontSize: Number(v) as PipPrefs["fontSize"] })}
      />
      <Choice
        label={t("ph_pip_original")}
        description={t("ph_pip_original_desc")}
        value={String(prefs.originalShare)}
        options={([0, 0.2, 0.4] as const).map((v) => ({ value: String(v), label: t(`ph_pip_original_${v * 10}` as "ph_pip_original_0") }))}
        onChange={(v) => setPipPrefs({ ...prefs, originalShare: Number(v) as PipPrefs["originalShare"] })}
      />
      <p className="py-3 text-sm leading-snug text-gray-600">{t("ph_pip_buttons")}</p>
    </div>
  );
}
