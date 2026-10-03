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

// Chip label in the interface language (preset_<key> in lib/i18n.ts), else
// the preset's own bilingual label
export function presetLabel(key: string, label: string, translate: (key: never) => string): string {
  const i18nKey = `preset_${key}`;
  const text = translate(i18nKey as never);
  return text === i18nKey ? label : text;
}

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
  // A US supplement manufacturer's finance team: US GAAP books and taxes,
  // manufacturing cost accounting, plus China VAT / export for cross-border
  // trade. English sides follow US usage. No pair whose English side is an
  // everyday word with another meaning here (check, credit, account, aging,
  // audit, voucher, interest): either side pulls a pair into the prompt, and
  // Hy-MT applies pairs literally.
  accounting: {
    label: "财务 Finance & Accounting",
    terms: [
      ...COMPANY,
      // 报表 / 科目
      "财务报表=Financial Statements", "资产负债表=Balance Sheet", "利润表=Income Statement",
      "损益表=Profit and Loss Statement", "现金流量表=Cash Flow Statement", "科目表=Chart of Accounts",
      "总账=General Ledger", "明细账=Subsidiary Ledger", "会计分录=Journal Entry",
      "试算平衡表=Trial Balance",
      "资产=Assets", "负债=Liabilities", "所有者权益=Owner's Equity", "留存收益=Retained Earnings",
      "营业收入=Revenue", "销售收入=Sales Revenue", "营业成本=Cost of Goods Sold", "COGS",
      "毛利=Gross Profit", "毛利率=Gross Margin", "营业费用=Operating Expenses",
      "销售费用=Selling Expenses", "管理费用=General and Administrative Expenses",
      "研发费用=R&D Expenses", "财务费用=Financial Expenses", "营业利润=Operating Income",
      "净利润=Net Income", "净利率=Net Margin", "EBITDA", "P&L",
      // 往来 / 资金
      "应收账款=Accounts Receivable", "应付账款=Accounts Payable", "AR", "AP",
      "预付款=Prepayment", "预收账款=Advances from Customers", "账龄分析=Aging Report",
      "坏账=Bad Debt", "坏账准备=Allowance for Doubtful Accounts",
      "回款=Payment Collection", "对账=Reconciliation", "银行对账=Bank Reconciliation",
      "对账单=Account Statement", "银行流水=Bank Statement", "现金流=Cash Flow",
      "电汇=Wire Transfer", "信用证=Letter of Credit", "汇率=Exchange Rate",
      "汇兑损益=Foreign Exchange Gain or Loss", "授信额度=Credit Line", "贷款=Loan",
      "发票=Invoice", "开票=Invoicing", "付款申请=Payment Request",
      "报销=Reimbursement", "费用报销单=Expense Report", "备用金=Petty Cash", "工资单=Payroll",
      // 成本 / 存货 / 资产
      "存货=Inventory", "原材料=Raw Materials", "在产品=Work in Process", "WIP",
      "产成品=Finished Goods", "成本核算=Cost Accounting", "标准成本=Standard Cost",
      "单位成本=Unit Cost", "直接材料=Direct Materials", "直接人工=Direct Labor",
      "制造费用=Manufacturing Overhead", "成本差异=Cost Variance", "盘点=Physical Count",
      "存货跌价=Inventory Write-down", "存货周转率=Inventory Turnover", "先进先出=FIFO",
      "加权平均=Weighted Average", "固定资产=Fixed Assets", "折旧=Depreciation",
      "摊销=Amortization", "资本支出=CapEx",
      // 结账 / 预算 / 审计
      "月结=Month-end Close", "年结=Year-end Close", "计提=Accrual",
      "应计费用=Accrued Expenses", "权责发生制=Accrual Basis", "收付实现制=Cash Basis",
      "预算=Budget", "预算差异=Budget Variance", "预测=Forecast", "同比=Year over Year",
      "环比=Month over Month", "财年=Fiscal Year", "审计报告=Audit Report",
      "内部控制=Internal Control", "会计准则=Accounting Standards", "美国通用会计准则=US GAAP",
      "注册会计师=CPA",
      // 美国税务
      "报税=Tax Return", "销售税=Sales Tax", "使用税=Use Tax", "联邦税=Federal Tax",
      "州税=State Tax", "企业所得税=Corporate Income Tax", "工资税=Payroll Tax",
      "预扣税=Withholding Tax", "转售证明=Resale Certificate", "免税=Tax Exempt",
      "W-9", "W-2", "1099", "EIN", "IRS",
      // 中国税务 / 跨境
      "增值税=VAT", "增值税专用发票=Special VAT Invoice", "进项税=Input VAT", "销项税=Output VAT",
      "出口退税=Export Tax Rebate", "关税=Customs Duty", "转移定价=Transfer Pricing",
      "关联交易=Related-party Transaction",
    ],
  },
};

// Generic presets, hidden while the app serves the supplement business.
// Move an entry back into INDUSTRY_PRESETS to show it again.
export const ARCHIVED_PRESETS: Record<string, IndustryPreset> = {
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
