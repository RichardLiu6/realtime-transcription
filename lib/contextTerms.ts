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
  supplements: {
    label: "保健品 Supplements",
    terms: [
      // 生产设备
      "胶囊填充机", "Capsule Filler", "Tamping Pin",
      "胶囊梳", "送囊梳", "Conveying Comb",
      "拨囊管", "贴标机", "压片机", "Tablet Press",
      "制粒机", "Granulator", "混合机", "Blender",
      "抛光机", "Capsule Polisher", "数粒机", "Capsule Counter",
      "灌装机", "封口机", "铝塑泡罩机", "Blister Machine",
      "包衣机", "Coating Machine", "软胶囊机", "Softgel Encapsulator",
      // 洁净车间
      "洁净车间", "Clean Room", "万级", "十万级",
      "风淋室", "Air Shower", "传递窗", "Pass Box",
      "层流罩", "Laminar Flow Hood", "压差", "尘埃粒子",
      // 质量/法规
      "GMP", "cGMP", "HACCP", "NSF", "USP", "FDA",
      "COA", "批号", "Lot Number", "批生产记录", "Batch Record",
      "留样", "稳定性试验", "微生物限度", "重金属检测",
      // 原料/剂型
      "原料", "辅料", "Excipient", "明胶", "Gelatin",
      "HPMC", "植物胶囊", "硬胶囊", "软胶囊", "Softgel",
      "片剂", "粉剂", "颗粒剂",
      // 工艺流程
      "投料", "配料", "制粒", "压片", "包衣",
      "筛分", "干燥", "灭菌", "内包", "外包", "CIP",
    ],
  },
};
