// The scripted meeting the demo video plays: three people, Chinese /
// English / Spanish, quick turns (what a busy real meeting looks like).
// Each line carries the translations the mock translation API answers with,
// so the video shows real text, not placeholders.

export const SPEAKERS = { li: "1", sarah: "2", carlos: "3" };

// [speaker, language, { zh, en, es }] — the spoken language's own text is
// the original
export const LINES = [
  ["li", "zh", { zh: "大家好，我们开始吧，今天主要看一下鱼油软胶囊的生产计划。", en: "Hi everyone, let's start. Today we'll mainly look at the fish oil softgel production plan.", es: "Hola a todos, empecemos. Hoy vamos a revisar sobre todo el plan de producción de las cápsulas blandas de aceite de pescado." }],
  ["sarah", "en", { zh: "好的。上个月亚马逊的销量增长了大约百分之三十。", en: "Sure. Amazon sales grew about thirty percent last month.", es: "Claro. Las ventas en Amazon crecieron cerca de un treinta por ciento el mes pasado." }],
  ["sarah", "en", { zh: "所以我们至少需要多两周的库存。", en: "So we need at least two more weeks of inventory.", es: "Así que necesitamos al menos dos semanas más de inventario." }],
  ["carlos", "es", { zh: "我这边有个问题，供应商说原料要晚到。", en: "I have a problem on my side, the supplier says the raw material will arrive late.", es: "Tengo un problema por mi parte, el proveedor dice que la materia prima llegará tarde." }],
  ["li", "zh", { zh: "晚多久？", en: "How late?", es: "¿Cuánto tarde?" }],
  ["carlos", "es", { zh: "大概十天。", en: "About ten days.", es: "Unos diez días." }],
  ["sarah", "en", { zh: "十天的话促销就赶不上了。", en: "Ten days means we miss the promotion.", es: "Diez días significa que perdemos la promoción." }],
  ["li", "zh", { zh: "那我们能不能先用上一批剩下的原料生产一部分？", en: "Then can we first produce part of it with the raw material left from the last batch?", es: "Entonces, ¿podemos producir primero una parte con la materia prima que sobró del último lote?" }],
  ["carlos", "es", { zh: "可以，但是只够大概五千瓶。", en: "Yes, but it's only enough for about five thousand bottles.", es: "Sí, pero solo alcanza para unas cinco mil botellas." }],
  ["sarah", "en", { zh: "五千瓶能撑一周左右。", en: "Five thousand bottles would last about a week.", es: "Cinco mil botellas durarían más o menos una semana." }],
  ["li", "zh", { zh: "好，那先做五千瓶。", en: "OK, let's make five thousand bottles first.", es: "Bien, hagamos primero cinco mil botellas." }],
  ["li", "zh", { zh: "质检那边要提前安排，批记录周五前要准备好。", en: "QC needs to be scheduled in advance, and the batch records must be ready by Friday.", es: "Hay que programar el control de calidad con antelación, y los registros de lote deben estar listos antes del viernes." }],
  ["sarah", "en", { zh: "我还需要更新后的标签文件给亚马逊。", en: "I also need the updated label files for Amazon.", es: "También necesito los archivos de etiquetas actualizados para Amazon." }],
  ["carlos", "es", { zh: "标签我今天下午发给你。", en: "I'll send you the labels this afternoon.", es: "Te mando las etiquetas esta tarde." }],
  ["sarah", "en", { zh: "太好了，谢谢。", en: "Great, thanks.", es: "Genial, gracias." }],
  ["li", "zh", { zh: "还有一个事，下个月的价格要不要调整？", en: "One more thing, should we adjust next month's price?", es: "Una cosa más, ¿ajustamos el precio del mes que viene?" }],
  ["sarah", "en", { zh: "我觉得先别动，等促销结束再看。", en: "I'd say leave it for now and look again after the promotion.", es: "Yo diría que lo dejemos por ahora y lo revisemos después de la promoción." }],
  ["carlos", "es", { zh: "同意。", en: "Agreed.", es: "De acuerdo." }],
  ["li", "zh", { zh: "好的，那就这么定了。", en: "OK, then it's settled.", es: "Bien, entonces queda decidido." }],
  ["sarah", "en", { zh: "我会把会议纪要发到群里。", en: "I'll send the meeting notes to the group.", es: "Enviaré el acta de la reunión al grupo." }],
  ["carlos", "es", { zh: "供应商那边我明天再确认一次交货时间。", en: "I'll confirm the delivery date with the supplier again tomorrow.", es: "Mañana vuelvo a confirmar la fecha de entrega con el proveedor." }],
  ["li", "zh", { zh: "辛苦了，有问题随时在群里说。", en: "Thanks for the work, raise anything in the group anytime.", es: "Gracias por el trabajo, cualquier cosa la comentáis en el grupo." }],
];

// Speech units revealed per step: two Chinese characters or one word
export function units(text, lang) {
  if (lang === "zh") return text.match(/.{1,2}/gu) ?? [];
  return text.split(" ").map((w, i) => (i === 0 ? w : " " + w));
}
