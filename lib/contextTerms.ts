// Separators accepted when typing or pasting terms: ASCII / Chinese comma,
// enumeration comma, semicolons, newlines
export const TERM_SEPARATORS = /[,，、;；\n]+/;

export function splitTermInput(text: string): string[] {
  return text.split(TERM_SEPARATORS).map((t) => t.trim()).filter(Boolean);
}

// Selected presets + custom terms, deduplicated, in order
export function combineTerms(presetKeys: Iterable<string>, customTerms: string[]): string[] {
  const presetTerms = Array.from(presetKeys).flatMap((key) => INDUSTRY_PRESETS[key]?.terms ?? []);
  return [...new Set([...presetTerms, ...customTerms])];
}

// Company and brand names, in every supplement preset
const COMPANY = ["ABL", "eguoo", "DOCKPER"];

export interface IndustryPreset {
  label: string;
  terms: string[];
}

export const INDUSTRY_PRESETS: Record<string, IndustryPreset> = {
  // Supplement factory, sales and e-commerce: "中文=English" pairs lock the
  // translation (and both sides still help speech recognition); single
  // entries are names / acronyms used as-is.
  supplements: {
    label: "保健品生产 Supplement Manufacturing",
    terms: [
      ...COMPANY,
      // 产品 / 配方
      "保健品=Dietary Supplement", "膳食补充剂=Dietary Supplement",
      "配方=Formula", "配方开发=Formula Development", "功效成分=Active Ingredient",
      "辅料=Excipient", "剂型=Dosage Form", "硬胶囊=Hard Capsule", "软胶囊=Softgel",
      "植物胶囊=Vegetarian Capsule", "胶囊壳=Capsule Shell", "明胶=Gelatin", "HPMC",
      "片剂=Tablet", "咀嚼片=Chewable Tablet", "泡腾片=Effervescent Tablet",
      "软糖=Gummy", "粉剂=Powder", "颗粒剂=Granules", "口服液=Oral Liquid",
      "益生菌=Probiotics", "植物提取物=Botanical Extract", "鱼油=Fish Oil",
      "标签宣称=Label Claim", "营养成分表=Supplement Facts", "份量=Serving Size",
      "每份含量=Amount Per Serving", "过量添加=Overage", "保质期=Shelf Life",
      "过敏原=Allergen", "非转基因=Non-GMO", "有机=Organic", "纯素=Vegan",
      "清真=Halal", "犹太洁食=Kosher",
      // 采购 / 原料 / 包材
      "原料=Raw Material", "合格供应商=Approved Supplier", "供应商审核=Supplier Audit",
      "来料检验=Incoming Inspection", "检验报告=Certificate of Analysis", "COA",
      "规格=Specification", "规格书=Spec Sheet", "包材=Packaging Material",
      "瓶子=Bottle", "瓶盖=Cap", "干燥剂=Desiccant", "铝箔封口=Induction Seal",
      "标签=Label", "外箱=Shipping Carton",
      // 生产工艺
      "主生产记录=Master Manufacturing Record", "批生产记录=Batch Record",
      "批号=Lot Number", "批次=Batch", "配料=Dispensing", "称量=Weighing",
      "投料=Charging", "混合=Blending", "制粒=Granulation", "干燥=Drying",
      "筛分=Sieving", "压片=Tableting", "包衣=Coating", "胶囊填充=Encapsulation",
      "装瓶=Bottling", "贴标=Labeling", "内包=Primary Packaging", "外包=Secondary Packaging",
      "清场=Line Clearance", "收率=Yield", "产能=Production Capacity", "返工=Rework",
      "灭菌=Sterilization", "CIP",
      // 设备
      "胶囊填充机=Capsule Filler", "软胶囊机=Softgel Encapsulator", "压片机=Tablet Press",
      "制粒机=Granulator", "混合机=Blender", "包衣机=Coating Machine",
      "抛光机=Capsule Polisher", "数粒机=Counting Machine", "灌装机=Filling Machine",
      "封口机=Induction Sealer", "贴标机=Labeling Machine", "铝塑泡罩机=Blister Machine",
      "送囊梳=Conveying Comb", "胶囊梳", "拨囊管", "Tamping Pin",
      // 洁净车间
      "洁净车间=Clean Room", "风淋室=Air Shower", "传递窗=Pass Box",
      "层流罩=Laminar Flow Hood", "压差=Differential Pressure", "尘埃粒子=Particle Count",
      "万级=Class 10,000", "十万级=Class 100,000",
      // 质量 / 检验 / 放行
      "质量控制=Quality Control", "质量保证=Quality Assurance", "QC", "QA",
      "来料放行=Material Release", "成品放行=Finished Product Release",
      "留样=Retained Sample", "稳定性试验=Stability Testing", "含量测定=Assay",
      "微生物限度=Microbial Limits", "重金属检测=Heavy Metals Testing",
      "崩解时限=Disintegration Time", "溶出度=Dissolution", "第三方检测=Third-party Testing",
      "偏差=Deviation", "纠正预防措施=CAPA", "不合格品=Nonconforming Product",
      "标准操作规程=SOP", "验证=Validation", "客户投诉=Customer Complaint",
      "召回=Recall", "审核=Audit", "飞行检查=Unannounced Audit",
      // 法规 / 认证
      "GMP", "cGMP", "FDA", "NSF", "USP", "HACCP", "21 CFR 111", "DSHEA", "FSMA", "GRAS",
      "新膳食成分=New Dietary Ingredient", "结构功能声称=Structure/Function Claim",
    ],
  },
  supplement_sales: {
    label: "保健品销售 Supplement Sales",
    terms: [
      ...COMPANY,
      "保健品=Dietary Supplement", "营养成分表=Supplement Facts",
      // 商务 / 销售
      "自有品牌=Private Label", "贴牌代工=OEM", "设计代工=ODM", "合同生产=Contract Manufacturing",
      "询盘=Inquiry", "报价单=Quotation", "最小起订量=MOQ", "打样=Sampling", "样品=Sample",
      "采购订单=Purchase Order", "形式发票=Proforma Invoice", "定金=Deposit",
      "尾款=Balance Payment", "账期=Payment Terms", "交期=Lead Time", "单价=Unit Price",
      "毛利率=Gross Margin", "经销商=Distributor", "独家代理=Exclusive Distributor",
      "零售商=Retailer", "供货协议=Supply Agreement", "保密协议=NDA",
      // 物流 / 外贸
      "离岸价=FOB", "到岸价=CIF", "工厂交货=EXW", "完税后交货=DDP", "海关编码=HS Code",
      "清关=Customs Clearance", "商业发票=Commercial Invoice", "装箱单=Packing List",
      "提单=Bill of Lading", "托盘=Pallet", "冷链=Cold Chain",
    ],
  },
  ecommerce: {
    label: "跨境电商 E-commerce",
    terms: [
      ...COMPANY,
      "TK=TikTok", "TikTok Shop", "亚马逊=Amazon", "独立站=DTC Website", "Shopify",
      "跨境电商=Cross-border E-commerce", "店铺=Store", "商品链接=Listing", "上架=List",
      "选品=Product Selection", "爆款=Best Seller", "定价=Pricing", "促销=Promotion",
      "优惠券=Coupon", "达人=Creator", "网红=Influencer", "寄样=Free Sample",
      "带货=Affiliate Selling", "联盟营销=Affiliate Marketing", "佣金=Commission",
      "直播=Livestream", "短视频=Short Video", "投流=Paid Traffic", "广告=Ads",
      "转化率=Conversion Rate", "点击率=CTR", "客单价=Average Order Value",
      "复购率=Repeat Purchase Rate", "退货率=Return Rate", "好评=Positive Review",
      "差评=Negative Review", "评价=Review", "海外仓=Overseas Warehouse",
      "头程=First-leg Shipping", "尾程=Last-mile Delivery", "库存=Inventory",
      "断货=Stockout", "GMV", "ROI", "SKU", "FBA",
    ],
  },
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
