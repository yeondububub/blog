/**
 * 디버깅 및 전역 상태 참조를 위한 레지스트리 객체
 */
const registry = {
  // 환경 설정 (config.js)
  config_siteConfig: typeof siteConfig !== "undefined" ? siteConfig : null,
  config_users: typeof users !== "undefined" ? users : null,
  config_localDataUsing:
    typeof localDataUsing !== "undefined" ? localDataUsing : null,

  // URL 및 라우팅 상태 (URLparsing.js)
  URLparsing_defaultTitle:
    typeof defaultTitle !== "undefined" ? defaultTitle : null,
  URLparsing_url: typeof url !== "undefined" ? url : null,
  URLparsing_origin: typeof origin !== "undefined" ? origin : null,
  URLparsing_pathParts: typeof pathParts !== "undefined" ? pathParts : null,
  URLparsing_isLocal: typeof isLocal !== "undefined" ? isLocal : null,

  // 데이터 상태 (initData.js)
  initData_blogList: typeof blogList !== "undefined" ? blogList : null,
  initData_blogMenu: typeof blogMenu !== "undefined" ? blogMenu : null,
  initData_isInitData: typeof isInitData !== "undefined" ? isInitData : null,
};