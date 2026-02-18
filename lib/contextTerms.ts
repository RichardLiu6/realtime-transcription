export interface IndustryPreset {
  label: string;
  terms: string[];
}

export const INDUSTRY_PRESETS: Record<string, IndustryPreset> = {
  manufacturing: {
    label: "制造业 Manufacturing",
    terms: [
      "OEM", "GMP", "MOQ", "BOM", "QC", "QA",
      "ISO", "CNC", "PLC", "ERP", "MES", "SPC",
      "FMEA", "PPAP", "Kaizen", "Kanban", "Six Sigma",
      "良率", "公差", "模具", "注塑", "冲压",
    ],
  },
  medical: {
    label: "医疗 Medical",
    terms: [
      "FDA", "ICH", "GCP", "GLP", "GMP",
      "IND", "NDA", "CRO", "IRB", "HIPAA",
      "临床试验", "不良反应", "适应症", "药代动力学",
      "生物标志物", "随机对照", "双盲",
    ],
  },
  legal: {
    label: "法律 Legal",
    terms: [
      "NDA", "SPA", "IP", "LLC", "M&A",
      "due diligence", "indemnification", "arbitration",
      "jurisdiction", "liability", "compliance",
      "知识产权", "合规", "尽职调查", "仲裁", "管辖权",
    ],
  },
  tech: {
    label: "科技 Tech",
    terms: [
      "API", "SDK", "SaaS", "PaaS", "IaaS",
      "CI/CD", "DevOps", "Kubernetes", "Docker",
      "microservices", "GraphQL", "REST",
      "机器学习", "深度学习", "大模型", "向量数据库",
    ],
  },
  finance: {
    label: "金融 Finance",
    terms: [
      "ROI", "P/E", "EBITDA", "IPO", "AUM",
      "KYC", "AML", "Basel", "VaR",
      "资产配置", "风控", "对冲", "杠杆", "估值",
    ],
  },
};
