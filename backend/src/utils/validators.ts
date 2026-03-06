import { NAME_RULE } from '../config';

export function normalizeInstanceName(value: string): string {
  return value.trim().toLowerCase();
}

export function validateInstanceName(value: string): string | null {
  if (!value) {
    return '实例名称不能为空';
  }
  if (value.length < NAME_RULE.minLength || value.length > NAME_RULE.maxLength) {
    return `实例名称长度必须在 ${NAME_RULE.minLength} 到 ${NAME_RULE.maxLength} 之间`;
  }
  if (!NAME_RULE.regex.test(value)) {
    return '实例名称只能包含英文、数字和连字符 -';
  }
  if (value.startsWith('-') || value.endsWith('-')) {
    return '实例名称不能以连字符开头或结尾';
  }
  return null;
}
