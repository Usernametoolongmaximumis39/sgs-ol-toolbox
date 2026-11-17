// Replaced at build time; source imports use the public distribution by default.
export const DEVELOPMENT = typeof __SGS_TOOLBOX_DEVELOPMENT__ !== 'undefined' && __SGS_TOOLBOX_DEVELOPMENT__;
export const EDITION = typeof __SGS_TOOLBOX_EDITION__ !== 'undefined' ? __SGS_TOOLBOX_EDITION__ : DEVELOPMENT ? 'dev' : 'full';
export const MICROCLIENT = typeof __SGS_TOOLBOX_MICROCLIENT__ !== 'undefined' && __SGS_TOOLBOX_MICROCLIENT__;
export const GITHUB_MARKET_URL = 'https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/plugins';
export const OSS_MARKET_URL = 'https://tools.3gs.xyz/sgs-toolbox/market';
export const HANGZHOU_MARKET_URL = 'https://chk-sgstools-hangzhou.oss-cn-hangzhou.aliyuncs.com/sgs-toolbox/market';
