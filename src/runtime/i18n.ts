export type Locale = "en" | "zh-CN";

export const MESSAGE_CODES = {
  MARKDOWN_PATH_OUTSIDE_ROOT: "MARKDOWN_PATH_OUTSIDE_ROOT",
  MARKDOWN_PATH_EXCLUDED: "MARKDOWN_PATH_EXCLUDED",
  MARKDOWN_FILE_VERSION_CHANGED: "MARKDOWN_FILE_VERSION_CHANGED",
  MEMORY_QUERY_NAMESPACE_REQUIRED: "MEMORY_QUERY_NAMESPACE_REQUIRED",
  MEMORY_NAMESPACE_REQUIRED: "MEMORY_NAMESPACE_REQUIRED",
  MEMORY_TEXT_REQUIRED: "MEMORY_TEXT_REQUIRED",
  MEMORY_TEXT_TOO_LARGE: "MEMORY_TEXT_TOO_LARGE",
  MEMORY_SENSITIVE_CONTENT: "MEMORY_SENSITIVE_CONTENT",
  R3_OVERWRITE_CLAIM: "R3_OVERWRITE_CLAIM",
  R3_SELF_EXTERNAL_VALIDATION: "R3_SELF_EXTERNAL_VALIDATION",
  R3_MIXED_CERTIFICATION: "R3_MIXED_CERTIFICATION",
} as const;

export type MessageCode = (typeof MESSAGE_CODES)[keyof typeof MESSAGE_CODES];

const messages: Record<MessageCode, Record<Locale, string>> = {
  MARKDOWN_PATH_OUTSIDE_ROOT: {
    en: "Markdown path is outside the allowed root",
    "zh-CN": "Markdown 路径超出允许的根目录",
  },
  MARKDOWN_PATH_EXCLUDED: {
    en: "Markdown path is in an excluded directory",
    "zh-CN": "Markdown 路径位于排除目录中",
  },
  MARKDOWN_FILE_VERSION_CHANGED: {
    en: "file_version changed while Markdown was being read; retry the snapshot",
    "zh-CN": "读取 Markdown 期间 file_version 已变化，请重试快照",
  },
  MEMORY_QUERY_NAMESPACE_REQUIRED: {
    en: "query and namespace are required",
    "zh-CN": "查询和 namespace 不能为空",
  },
  MEMORY_NAMESPACE_REQUIRED: {
    en: "A valid namespace is required",
    "zh-CN": "必须提供有效的 namespace",
  },
  MEMORY_TEXT_REQUIRED: {
    en: "Captured text must not be empty",
    "zh-CN": "捕获文本不能为空",
  },
  MEMORY_TEXT_TOO_LARGE: {
    en: "Captured text exceeds the single-candidate limit",
    "zh-CN": "捕获文本超过单候选长度限制",
  },
  MEMORY_SENSITIVE_CONTENT: {
    en: "Sensitive content is not eligible for memory capture",
    "zh-CN": "敏感内容不得用于记忆捕获",
  },
  R3_OVERWRITE_CLAIM: {
    en: "A mismatch between the original and recomputed values does not prove the original value is wrong",
    "zh-CN": "原值与复算不一致不等于原值已证实错误",
  },
  R3_SELF_EXTERNAL_VALIDATION: {
    en: "v2 and R3 share a source and cannot independently establish external correctness",
    "zh-CN": "v2 与 R3 同源，不能作为外部正确性的独立证据",
  },
  R3_MIXED_CERTIFICATION: {
    en: "The 604 original-match rows and 97 pending-review rows must be reported separately",
    "zh-CN": "604 条原始吻合与 97 条待复核必须分组统计",
  },
};

export function getLocale(fallback: Locale = "en"): Locale {
  const configured = process.env.OPTIONMEMORY_LOCALE?.trim().toLowerCase();
  if (configured === "zh" || configured === "zh-cn" || configured === "zh_cn") return "zh-CN";
  if (configured === "en" || configured === "en-us") return "en";
  return fallback;
}

export function message(code: MessageCode, fallback: Locale = "en"): string {
  return messages[code][getLocale(fallback)];
}
