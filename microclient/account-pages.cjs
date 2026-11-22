'use strict';

const pages = {
  1: 'https://web.sanguosha.com/login/air/client/h5/index',
  3: 'https://my.4399.com/yxsgs/wd-home'
};
const ipc = {
  save: 'sgs-toolbox:accounts-save:v1',
  fill: 'sgs-toolbox:accounts-fill:v1',
  take: 'sgs-toolbox:accounts-take:v1',
  result: 'sgs-toolbox:accounts-result:v1'
};
function loginChannel(value) {
  try {
    const url = new URL(value);
    return Object.keys(pages).map(Number).find(id => pages[id] === url.origin + url.pathname) || 0;
  } catch (_) { return 0; }
}
function validCredentials(value) {
  return value && typeof value.username === 'string' && value.username.length <= 128 && !!value.username.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value.username) && typeof value.password === 'string' &&
    value.password.length > 0 && value.password.length <= 256;
}

module.exports = { ipc, loginChannel, validCredentials };
