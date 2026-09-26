"use client";

import { useCallback, useSyncExternalStore } from "react";
import { SONIOX_LANGUAGES } from "@/types/bilingual";

// Interface languages. The choice is remembered in localStorage
// ("uiLocale"); without one, the browser language decides.
export const LOCALES = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "vi", label: "Tiếng Việt" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

const en = {
  // Recording
  "start_recording": "Start Recording",
  "stop_recording": "Stop Recording",
  "stop": "Stop",
  "connecting": "Connecting...",

  // STT engine
  "stt_engine": "Speech engine",
  "stt_soniox_desc": "Soniox cloud: speaker diarization, 60+ languages",
  "stt_r2t2_desc": "Youdao R2T2 (self-hosted): low-latency Chinese/English, no speaker diarization",
  "stt_r2t2_unavailable": "R2T2 server not configured (set R2T2_WS_URL and R2T2_SECRET_KEY)",
  "audio_processing": "Noise reduction",
  "translation_engine": "Translation",
  "tr_llm": "Sentence",
  "tr_t3po": "T3PO",
  "tr_clause": "Clause",
  "tr_clause_desc": "Translate each clause as soon as it ends (at a comma or full stop), appended without rewriting. Any language, uses the translation model set in admin.",
  "tr_llm_desc": "Translate each sentence after it ends, with the translation model set in admin. Works for all languages.",
  "tr_t3po_desc": "Simultaneous interpretation with Youdao T3PO: translation appears while the sentence is still being spoken. Chinese↔English only; in multilingual mode the other columns use clause translation, elsewhere other languages use sentence translation.",
  "tr_t3po_unavailable": "Simultaneous translation not configured (set T3PO_BASE_URL to a server running Confucius4-T3PO)",
  "audio_processing_on": "Browser noise suppression, echo cancellation and auto gain are ON. Use in noisy rooms; may drop quiet or distant speakers.",
  "audio_processing_off": "Raw microphone audio (recommended for accuracy). Turn on only in very noisy rooms.",

  // Top bar
  "ui_language": "Interface language",
  "layout_sidebar": "Sidebar",
  "layout_topbar": "Top Bar",
  "layout_floating": "Floating",
  "admin_panel": "Admin panel",
  "logout": "Log out",

  // Bottom bar buttons
  "settings": "Settings",
  "terms": "Terms",
  "export": "Export",
  "new_meeting": "New Meeting",

  // Translation mode
  "translation_mode": "Translation Mode",
  "mode_between": "Between",
  "mode_from_to": "From→To",
  "mode_between_desc": "Auto-detect bilingual conversation",
  "mode_from_to_desc": "Fixed source language, translate to target",
  "mode_presentation": "Multilingual",
  "mode_presentation_desc": "Original transcript plus a translation into every selected language, side by side",
  "target_languages": "Translate into (one column each)",

  // Languages
  "languages": "Languages",
  "language_a": "Language A",
  "language_b": "Language B",
  "source_language": "Source Language",
  "target_language": "Target Language",
  "any_language": "Any Language (Auto)",

  // Terms panel
  "context_terms": "Context Terms",
  "add_term_placeholder": "Add term (or 中文=English), press Enter",
  "terms_effect_next": "Takes effect on next recording",
  "terms_effect_start": "Takes effect when recording starts",
  "preset_supplements": "Supplement Manufacturing",
  "preset_supplement_sales": "Supplement Sales",
  "preset_ecommerce": "E-commerce",

  // Speakers
  "speakers": "Speakers",
  "words": "words",

  // Transcript
  "listening": "Listening...",
  "click_start": "Click Start Recording to begin",
  "original_text": "Original",
  "translating": "Translating...",
  "presentation_empty": "Choose the meeting languages and start recording",

  // Confirm dialogs
  "confirm_language_change": "Changing language will stop recording. Continue?",
  "confirm_mode_change": "Changing translation mode will stop recording. Continue?",

  // Errors shown in the banner
  "err_translation_failed": "Translation failed",
  "err_translation_http": "Translation failed (HTTP {status})",
  "err_simul_fallback": "Simultaneous translation failed; switched to sentence translation",
  "err_disconnected": "Disconnected",
  "err_websocket": "Connection error",
  "err_start_failed": "Could not start recording",

  // Login
  "login_title": "Real-time Transcription",
  "login_email_prompt": "Enter your email to get a verification code",
  "login_code_sent": "Verification code sent to {email}",
  "login_meeting_prompt": "Enter a meeting code to join a temporary meeting",
  "login_send_code": "Send code",
  "login_join_temp_meeting": "Join a temporary meeting",
  "login_code_placeholder": "6-digit code",
  "login_submit": "Log in",
  "login_change_email": "Use another email",
  "login_meeting_code_placeholder": "6-digit meeting code",
  "login_join_meeting": "Join meeting",
  "login_back": "Back to login",
  "login_network_error": "Network error, please try again",
  "login_send_failed": "Could not send the code",
  "login_verify_failed": "Verification failed",
  "login_join_failed": "Could not join",
  "auth_email_required": "Please enter your email",
  "auth_email_not_allowed": "This email is not authorized. Please contact the administrator",
  "auth_code_required": "Please enter the verification code",
  "auth_code_expired": "The code has expired. Please request a new one",
  "auth_code_wrong": "Incorrect code",
  "auth_meeting_code_required": "Please enter the meeting code",
  "auth_meeting_invalid": "Invalid meeting code",
  "auth_meeting_expired": "This meeting code has expired",
  "auth_send_failed": "Could not send the code. Please try again later",
  "auth_server_error": "Service error. Please try again later",
};

export type TranslationKey = keyof typeof en;

const zh: Record<TranslationKey, string> = {
  "start_recording": "开始录音",
  "stop_recording": "停止录音",
  "stop": "停止",
  "connecting": "连接中...",

  "stt_engine": "识别引擎",
  "stt_soniox_desc": "Soniox 云端识别：支持说话人区分、60+ 语言",
  "stt_r2t2_desc": "有道 R2T2 自部署模型：中英文低延迟，无说话人区分",
  "stt_r2t2_unavailable": "R2T2 服务未配置（需要 R2T2_WS_URL 和 R2T2_SECRET_KEY）",
  "audio_processing": "降噪",
  "translation_engine": "翻译方式",
  "tr_llm": "整句",
  "tr_t3po": "同传",
  "tr_clause": "分句",
  "tr_clause_desc": "每说完一个小句（逗号、句号处）就翻译并追加，已出的译文不再改动。支持所有语言，使用后台设置的翻译模型。",
  "tr_llm_desc": "每句话说完再翻译，使用后台设置的翻译模型，支持所有语言。",
  "tr_t3po_desc": "有道 T3PO 同声传译：话还没说完译文就开始出现。仅支持中英互译；多语言模式下其他列自动改用分句翻译，其他模式下其他语言改用整句翻译。",
  "tr_t3po_unavailable": "同传翻译未配置（需要把 T3PO_BASE_URL 指向运行 Confucius4-T3PO 的服务器）",
  "audio_processing_on": "已开启浏览器降噪、回声消除和自动增益。适合嘈杂环境，但可能压掉声音小或离麦克风远的发言人。",
  "audio_processing_off": "使用原始麦克风音频（识别更准，推荐）。只在环境非常嘈杂时开启降噪。",

  "ui_language": "界面语言",
  "layout_sidebar": "侧边栏",
  "layout_topbar": "顶栏",
  "layout_floating": "浮动",
  "admin_panel": "管理后台",
  "logout": "退出登录",

  "settings": "设置",
  "terms": "术语",
  "export": "导出",
  "new_meeting": "新会议",

  "translation_mode": "翻译模式",
  "mode_between": "双向",
  "mode_from_to": "单向",
  "mode_between_desc": "自动检测双语对话",
  "mode_from_to_desc": "固定源语言，翻译到目标语言",
  "mode_presentation": "多语言",
  "mode_presentation_desc": "原文转录 + 翻译成所选的每种语言，分列对照",
  "target_languages": "翻译成（每种一列）",

  "languages": "语言",
  "language_a": "语言 A",
  "language_b": "语言 B",
  "source_language": "源语言",
  "target_language": "目标语言",
  "any_language": "任意语言（自动）",

  "context_terms": "上下文术语",
  "add_term_placeholder": "输入术语（可写 中文=English），回车添加",
  "terms_effect_next": "下次录音时生效",
  "terms_effect_start": "开始录音时生效",
  "preset_supplements": "保健品生产",
  "preset_supplement_sales": "保健品销售",
  "preset_ecommerce": "跨境电商",

  "speakers": "说话人",
  "words": "字",

  "listening": "聆听中...",
  "click_start": "点击开始录音",
  "original_text": "原文",
  "translating": "翻译中...",
  "presentation_empty": "选择会议语言并开始录音",

  "confirm_language_change": "切换语言将停止录音，是否继续？",
  "confirm_mode_change": "切换翻译模式将停止录音，是否继续？",

  "err_translation_failed": "翻译失败",
  "err_translation_http": "翻译失败（HTTP {status}）",
  "err_simul_fallback": "同传翻译失败，已改用整句翻译",
  "err_disconnected": "连接已断开",
  "err_websocket": "连接出错",
  "err_start_failed": "无法开始录音",

  "login_title": "实时转录",
  "login_email_prompt": "输入邮箱获取验证码",
  "login_code_sent": "验证码已发送至 {email}",
  "login_meeting_prompt": "输入会议码加入临时会议",
  "login_send_code": "发送验证码",
  "login_join_temp_meeting": "加入临时会议",
  "login_code_placeholder": "6 位验证码",
  "login_submit": "登录",
  "login_change_email": "更换邮箱",
  "login_meeting_code_placeholder": "6 位会议码",
  "login_join_meeting": "加入会议",
  "login_back": "返回登录",
  "login_network_error": "网络错误，请重试",
  "login_send_failed": "发送失败",
  "login_verify_failed": "验证失败",
  "login_join_failed": "加入失败",
  "auth_email_required": "请输入邮箱地址",
  "auth_email_not_allowed": "该邮箱未被授权，请联系管理员",
  "auth_code_required": "请输入验证码",
  "auth_code_expired": "验证码已过期，请重新发送",
  "auth_code_wrong": "验证码错误",
  "auth_meeting_code_required": "请输入会议码",
  "auth_meeting_invalid": "会议码无效",
  "auth_meeting_expired": "会议码已过期",
  "auth_send_failed": "验证码发送失败，请稍后重试",
  "auth_server_error": "服务异常，请稍后重试",
};

const es: Record<TranslationKey, string> = {
  "start_recording": "Iniciar grabación",
  "stop_recording": "Detener grabación",
  "stop": "Detener",
  "connecting": "Conectando...",

  "stt_engine": "Motor de voz",
  "stt_soniox_desc": "Soniox en la nube: identifica a cada hablante, más de 60 idiomas",
  "stt_r2t2_desc": "Youdao R2T2 (servidor propio): chino/inglés con baja latencia, sin identificación de hablantes",
  "stt_r2t2_unavailable": "Servidor R2T2 no configurado (defina R2T2_WS_URL y R2T2_SECRET_KEY)",
  "audio_processing": "Reducción de ruido",
  "translation_engine": "Traducción",
  "tr_llm": "Por frase",
  "tr_t3po": "Simultánea",
  "tr_clause": "Por cláusula",
  "tr_clause_desc": "Traduce cada cláusula en cuanto termina (en una coma o un punto) y la añade sin reescribir lo anterior. Cualquier idioma; usa el modelo de traducción configurado en administración.",
  "tr_llm_desc": "Traduce cada frase cuando termina, con el modelo de traducción configurado en administración. Funciona en todos los idiomas.",
  "tr_t3po_desc": "Interpretación simultánea con Youdao T3PO: la traducción aparece mientras la frase todavía se está diciendo. Solo chino↔inglés; en el modo multilingüe las demás columnas usan traducción por cláusula y en los demás modos los otros idiomas usan traducción por frase.",
  "tr_t3po_unavailable": "Traducción simultánea no configurada (T3PO_BASE_URL debe apuntar a un servidor con Confucius4-T3PO)",
  "audio_processing_on": "Supresión de ruido, cancelación de eco y ganancia automática del navegador ACTIVADAS. Útil en salas ruidosas; puede perder a hablantes con voz baja o lejos del micrófono.",
  "audio_processing_off": "Audio del micrófono sin procesar (recomendado para mayor precisión). Actívela solo en salas muy ruidosas.",

  "ui_language": "Idioma de la interfaz",
  "layout_sidebar": "Barra lateral",
  "layout_topbar": "Barra superior",
  "layout_floating": "Flotante",
  "admin_panel": "Administración",
  "logout": "Cerrar sesión",

  "settings": "Ajustes",
  "terms": "Términos",
  "export": "Exportar",
  "new_meeting": "Nueva reunión",

  "translation_mode": "Modo de traducción",
  "mode_between": "Bidireccional",
  "mode_from_to": "De→A",
  "mode_between_desc": "Detecta automáticamente una conversación bilingüe",
  "mode_from_to_desc": "Idioma de origen fijo, traducido al idioma de destino",
  "mode_presentation": "Multilingüe",
  "mode_presentation_desc": "Transcripción original más una traducción a cada idioma seleccionado, en columnas",
  "target_languages": "Traducir a (una columna por idioma)",

  "languages": "Idiomas",
  "language_a": "Idioma A",
  "language_b": "Idioma B",
  "source_language": "Idioma de origen",
  "target_language": "Idioma de destino",
  "any_language": "Cualquier idioma (auto)",

  "context_terms": "Términos de contexto",
  "add_term_placeholder": "Añada un término (o 中文=English) y pulse Enter",
  "terms_effect_next": "Se aplica en la próxima grabación",
  "terms_effect_start": "Se aplica al iniciar la grabación",
  "preset_supplements": "Fabricación de suplementos",
  "preset_supplement_sales": "Ventas de suplementos",
  "preset_ecommerce": "Comercio electrónico",

  "speakers": "Hablantes",
  "words": "palabras",

  "listening": "Escuchando...",
  "click_start": "Pulse Iniciar grabación para empezar",
  "original_text": "Original",
  "translating": "Traduciendo...",
  "presentation_empty": "Elija los idiomas de la reunión e inicie la grabación",

  "confirm_language_change": "Cambiar el idioma detendrá la grabación. ¿Continuar?",
  "confirm_mode_change": "Cambiar el modo de traducción detendrá la grabación. ¿Continuar?",

  "err_translation_failed": "Error de traducción",
  "err_translation_http": "Error de traducción (HTTP {status})",
  "err_simul_fallback": "Falló la traducción simultánea; se usa traducción por frase",
  "err_disconnected": "Desconectado",
  "err_websocket": "Error de conexión",
  "err_start_failed": "No se pudo iniciar la grabación",

  "login_title": "Transcripción en tiempo real",
  "login_email_prompt": "Introduzca su correo para recibir un código de verificación",
  "login_code_sent": "Código enviado a {email}",
  "login_meeting_prompt": "Introduzca un código de reunión para unirse a una reunión temporal",
  "login_send_code": "Enviar código",
  "login_join_temp_meeting": "Unirse a una reunión temporal",
  "login_code_placeholder": "Código de 6 dígitos",
  "login_submit": "Iniciar sesión",
  "login_change_email": "Usar otro correo",
  "login_meeting_code_placeholder": "Código de reunión de 6 dígitos",
  "login_join_meeting": "Unirse a la reunión",
  "login_back": "Volver al inicio de sesión",
  "login_network_error": "Error de red, inténtelo de nuevo",
  "login_send_failed": "No se pudo enviar el código",
  "login_verify_failed": "Verificación fallida",
  "login_join_failed": "No se pudo unir",
  "auth_email_required": "Introduzca su correo electrónico",
  "auth_email_not_allowed": "Este correo no está autorizado. Contacte con el administrador",
  "auth_code_required": "Introduzca el código de verificación",
  "auth_code_expired": "El código ha caducado. Solicite uno nuevo",
  "auth_code_wrong": "Código incorrecto",
  "auth_meeting_code_required": "Introduzca el código de reunión",
  "auth_meeting_invalid": "Código de reunión no válido",
  "auth_meeting_expired": "El código de reunión ha caducado",
  "auth_send_failed": "No se pudo enviar el código. Inténtelo más tarde",
  "auth_server_error": "Error del servicio. Inténtelo más tarde",
};

const vi: Record<TranslationKey, string> = {
  "start_recording": "Bắt đầu ghi âm",
  "stop_recording": "Dừng ghi âm",
  "stop": "Dừng",
  "connecting": "Đang kết nối...",

  "stt_engine": "Công cụ nhận dạng giọng nói",
  "stt_soniox_desc": "Soniox trên đám mây: phân biệt người nói, hơn 60 ngôn ngữ",
  "stt_r2t2_desc": "Youdao R2T2 (tự triển khai): tiếng Trung/tiếng Anh độ trễ thấp, không phân biệt người nói",
  "stt_r2t2_unavailable": "Chưa cấu hình máy chủ R2T2 (cần R2T2_WS_URL và R2T2_SECRET_KEY)",
  "audio_processing": "Giảm tiếng ồn",
  "translation_engine": "Cách dịch",
  "tr_llm": "Theo câu",
  "tr_t3po": "Song song",
  "tr_clause": "Theo vế",
  "tr_clause_desc": "Dịch từng vế câu ngay khi kết thúc (tại dấu phẩy hoặc dấu chấm) và nối tiếp, không sửa lại phần đã dịch. Mọi ngôn ngữ; dùng mô hình dịch được cài đặt trong trang quản trị.",
  "tr_llm_desc": "Dịch mỗi câu sau khi nói xong, bằng mô hình dịch được cài đặt trong trang quản trị. Hỗ trợ mọi ngôn ngữ.",
  "tr_t3po_desc": "Phiên dịch song song với Youdao T3PO: bản dịch xuất hiện ngay khi câu còn đang được nói. Chỉ hỗ trợ Trung↔Anh; ở chế độ đa ngôn ngữ các cột khác dịch theo vế, ở các chế độ khác các ngôn ngữ còn lại dịch theo câu.",
  "tr_t3po_unavailable": "Chưa cấu hình dịch song song (T3PO_BASE_URL phải trỏ tới máy chủ chạy Confucius4-T3PO)",
  "audio_processing_on": "Đã BẬT khử tiếng ồn, khử tiếng vọng và tự động điều chỉnh âm lượng của trình duyệt. Dùng khi phòng ồn; có thể bỏ sót người nói nhỏ hoặc ở xa micro.",
  "audio_processing_off": "Âm thanh micro nguyên gốc (khuyến nghị để nhận dạng chính xác hơn). Chỉ bật khi phòng rất ồn.",

  "ui_language": "Ngôn ngữ giao diện",
  "layout_sidebar": "Thanh bên",
  "layout_topbar": "Thanh trên",
  "layout_floating": "Nổi",
  "admin_panel": "Trang quản trị",
  "logout": "Đăng xuất",

  "settings": "Cài đặt",
  "terms": "Thuật ngữ",
  "export": "Xuất",
  "new_meeting": "Cuộc họp mới",

  "translation_mode": "Chế độ dịch",
  "mode_between": "Hai chiều",
  "mode_from_to": "Một chiều",
  "mode_between_desc": "Tự động nhận diện hội thoại song ngữ",
  "mode_from_to_desc": "Ngôn ngữ nguồn cố định, dịch sang ngôn ngữ đích",
  "mode_presentation": "Đa ngôn ngữ",
  "mode_presentation_desc": "Bản ghi gốc kèm bản dịch sang từng ngôn ngữ đã chọn, đặt cạnh nhau",
  "target_languages": "Dịch sang (mỗi ngôn ngữ một cột)",

  "languages": "Ngôn ngữ",
  "language_a": "Ngôn ngữ A",
  "language_b": "Ngôn ngữ B",
  "source_language": "Ngôn ngữ nguồn",
  "target_language": "Ngôn ngữ đích",
  "any_language": "Bất kỳ ngôn ngữ nào (tự động)",

  "context_terms": "Thuật ngữ ngữ cảnh",
  "add_term_placeholder": "Nhập thuật ngữ (hoặc 中文=English), nhấn Enter",
  "terms_effect_next": "Có hiệu lực từ lần ghi âm tiếp theo",
  "terms_effect_start": "Có hiệu lực khi bắt đầu ghi âm",
  "preset_supplements": "Sản xuất thực phẩm bổ sung",
  "preset_supplement_sales": "Kinh doanh thực phẩm bổ sung",
  "preset_ecommerce": "Thương mại điện tử",

  "speakers": "Người nói",
  "words": "từ",

  "listening": "Đang nghe...",
  "click_start": "Nhấn Bắt đầu ghi âm để bắt đầu",
  "original_text": "Bản gốc",
  "translating": "Đang dịch...",
  "presentation_empty": "Chọn ngôn ngữ cuộc họp và bắt đầu ghi âm",

  "confirm_language_change": "Đổi ngôn ngữ sẽ dừng ghi âm. Tiếp tục?",
  "confirm_mode_change": "Đổi chế độ dịch sẽ dừng ghi âm. Tiếp tục?",

  "err_translation_failed": "Dịch thất bại",
  "err_translation_http": "Dịch thất bại (HTTP {status})",
  "err_simul_fallback": "Dịch song song thất bại; đã chuyển sang dịch theo câu",
  "err_disconnected": "Mất kết nối",
  "err_websocket": "Lỗi kết nối",
  "err_start_failed": "Không thể bắt đầu ghi âm",

  "login_title": "Phiên âm thời gian thực",
  "login_email_prompt": "Nhập email để nhận mã xác minh",
  "login_code_sent": "Đã gửi mã xác minh tới {email}",
  "login_meeting_prompt": "Nhập mã cuộc họp để tham gia cuộc họp tạm thời",
  "login_send_code": "Gửi mã",
  "login_join_temp_meeting": "Tham gia cuộc họp tạm thời",
  "login_code_placeholder": "Mã 6 chữ số",
  "login_submit": "Đăng nhập",
  "login_change_email": "Dùng email khác",
  "login_meeting_code_placeholder": "Mã cuộc họp 6 chữ số",
  "login_join_meeting": "Tham gia cuộc họp",
  "login_back": "Quay lại đăng nhập",
  "login_network_error": "Lỗi mạng, vui lòng thử lại",
  "login_send_failed": "Không gửi được mã",
  "login_verify_failed": "Xác minh thất bại",
  "login_join_failed": "Không thể tham gia",
  "auth_email_required": "Vui lòng nhập email",
  "auth_email_not_allowed": "Email này chưa được cấp quyền. Vui lòng liên hệ quản trị viên",
  "auth_code_required": "Vui lòng nhập mã xác minh",
  "auth_code_expired": "Mã đã hết hạn. Vui lòng gửi lại mã mới",
  "auth_code_wrong": "Mã không đúng",
  "auth_meeting_code_required": "Vui lòng nhập mã cuộc họp",
  "auth_meeting_invalid": "Mã cuộc họp không hợp lệ",
  "auth_meeting_expired": "Mã cuộc họp đã hết hạn",
  "auth_send_failed": "Không gửi được mã. Vui lòng thử lại sau",
  "auth_server_error": "Lỗi dịch vụ. Vui lòng thử lại sau",
};

const translations: Record<Locale, Record<TranslationKey, string>> = { en, zh, es, vi };

// --- Current locale: stored choice, else browser language ---

const STORAGE_KEY = "uiLocale";
const EVENT = "ui-locale";

function isLocale(v: unknown): v is Locale {
  return LOCALES.some((l) => l.code === v);
}

function detectLocale(): Locale {
  const lang = (typeof navigator !== "undefined" && navigator.language) || "en";
  const base = lang.toLowerCase().split("-")[0];
  return isLocale(base) ? base : "en";
}

export function getLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // storage unavailable
  }
  return detectLocale();
}

export function setLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // storage unavailable: the choice lasts until reload
  }
  document.documentElement.lang = locale;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Server render uses English; the client switches to the user's language
// right after hydration (no hydration mismatch)
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => "en");
}

function translate(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
  let text = translations[locale][key] ?? translations.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
  return text;
}

// Outside React (event handlers, hooks' callbacks): the current locale at call time
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  return translate(getLocale(), key, vars);
}

export function useT() {
  const locale = useLocale();
  return useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  );
}

// Meeting-language names: the language's own name, plus its name in the
// interface language when that differs — "中文 · Chinese" in the English UI,
// "English · 英语" in the Chinese one (Intl covers every Soniox language)
export function languageLabel(code: string, locale: Locale): string {
  const native = SONIOX_LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();
  let local: string | undefined;
  try {
    local = new Intl.DisplayNames([locale], { type: "language" }).of(code);
  } catch {
    // unknown code / old browser: native name only
  }
  if (!local || local === code || local.toLowerCase() === native.toLowerCase()) return native;
  return `${native} · ${local}`;
}

export function useLanguageName() {
  const locale = useLocale();
  return useCallback((code: string) => languageLabel(code, locale), [locale]);
}
