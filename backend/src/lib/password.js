// 删除密码校验
import { DEFAULT_DELETE_PASSWORD } from '@optical/shared/constants.js';

export function getDeletePassword() {
  return process.env.DELETE_PASSWORD || DEFAULT_DELETE_PASSWORD;
}

export function checkDeletePassword(input) {
  return input === getDeletePassword();
}
