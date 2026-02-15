export type ModelId = "soniox" | "gpt-4o-transcribe" | "gpt-4o-mini-transcribe";

export interface ModelConfig {
  id: ModelId;
  name: string;
  provider: "soniox" | "openai";
  color: string;
}

export interface ModelMetrics {
  firstWordMs: number;
  connectionMs: number;
  totalWords: number;
  finalSegments: string[];
}

export interface ModelResult {
  transcript: string;
  interimText: string;
  isConnected: boolean;
  error: string | null;
  metrics: ModelMetrics;
}

export const MODEL_CONFIGS: ModelConfig[] = [
  {
    id: "soniox",
    name: "Soniox v4",
    provider: "soniox",
    color: "purple",
  },
  {
    id: "gpt-4o-transcribe",
    name: "GPT-4o Transcribe",
    provider: "openai",
    color: "green",
  },
  {
    id: "gpt-4o-mini-transcribe",
    name: "GPT-4o Mini",
    provider: "openai",
    color: "blue",
  },
];
