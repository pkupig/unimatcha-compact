// Shared mutable application state.
// Every module imports { S } and reads/writes through it.
export const S = {
  currentUser: null,
  userSettings: null,
  activeTab: 'match',
  // 本地开发（localhost / 127.0.0.1 / 裸 IP）：直连 API 的 :3001。
  // 生产（Caddy）：H5 在 app.<域名>，API 在 api.<域名>，且必须 https——原来的
  // `http://${hostname}:3001` 会（1）混合内容被浏览器拦、（2）打到未暴露的 3001 端口。
  API: (() => {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      return `${location.protocol}//${h}:3001/api/v1`;
    }
    return `https://api.${h.replace(/^app\./, '')}/api/v1`;
  })(),
  currentQuestion: 0,
  answers: {},
  questionnaire: null,

  // ===== Dual-mode redesign (DESIGN-DUAL-MODE §6.1 / §6.11) =====
  // Home top-level view (A rule three-switch): 'chat' | 'romantic' | 'friend'
  homeView: 'chat',                          // default enters Chat (all conversations)
  activeMatchMode: 'romantic',               // 'romantic' | 'friend' — current match-mode view
  matchStatus: {                             // bucketed by mode (replaces single matchStatus)
    romantic: null,  // { state, match, partner, nextRunAt, matchConfig, remainingMs }
    friend:   null,  // { state, matches:[...], nextRunAt }
  },
  sessions: [],                              // Chat session list cache (temp + confirmed)
  romanticAnswers: {},                       // questionnaire answer buckets (replaces single S.answers)
  friendAnswers: {},
  questionnaireMode: 'romantic',             // mode currently being filled
  friendPrefInterests: [],                   // friend preference multi-select caches
  friendPrefActivities: [],
  friendGender: 'all',                       // friend preferred-gender segment ('male'|'female'|'all')
  prefMode: 'romantic',                      // preferences sheet active tab ('romantic'|'friend')

  // Enhanced mode (J rule §10.5)
  energy: { totalEnergy: 0, usedEnergy: 0, availableEnergy: 0 }, // /energy/balance cache
  enhanced: {                                // match-setting enhance toggles, bucketed by mode (rehydrated from UMP)
    romantic: { enabled: false, cost: 3 },
    friend:   { enabled: false, cells: 1 },  // cells = 1–5, cost === cells
  },
  energyPackages: [                          // recharge packages (constant fallback; may be refreshed from /energy/packages)
    { id: 'pkg_30',  cells: 30,  price: '¥30' },
    { id: 'pkg_60',  cells: 60,  price: '¥58' },
    { id: 'pkg_100', cells: 100, price: '¥88' },
  ],

  matchPollingId: null,
  matchPollFailCount: 0,
  isSubmittingProposal: false,
  matchBasis: 'both',
  matchExtraInfo: '',
  chatMatchId: null,
  chatPartnerId: null,
  chatPartnerName: null,
  // Per-session metadata for the open conversation (§6.6): drives the in-chat
  // confirm/dissolve header actions. Set by openSession() from the list item.
  chatSessionType: null,                     // 'temp' | 'confirmed'
  chatMode: null,                            // 'romantic' | 'friend'
  chatMyConfirmed: false,                    // current user already confirmed?
  chatPartnerConfirmed: false,               // the other side already confirmed?
  chatSessionStatus: null,                   // raw session.status passthrough
  sessionCountdownId: null,                  // setInterval id for temp-session "剩余Xh" badges
  chatMessages: [],
  chatPollingId: null,
  chatLastId: null,
  chatNextCursor: null,
  chatRenderFrom: 0,
  chatLoadingHistory: false,
  chatPollBusy: false,
  chatPollTick: 0,
  countdownInterval: null,
  // Campus stick-figure match animation: id of the setInterval that randomly
  // swaps the idle action class. Cleared on tab switch / re-render / waiting mode.
  campusAnimTimer: null,
  notifPollingId: null,
  notifList: [],
  notifPage: 1,
  notifHasMore: false,
  notifLoadingMore: false,
  currentPostId: null,
  pdPostData: null,
  pdSortMode: 'time',
  pdReplyTo: null,
  pdPendingImgs: [],
  newPostImages: [],
  squarePosts: [],
  squareReqSeq: 0,
  isSubmittingPost: false,
  squareSection: 'recommended',
  squareSearchQuery: '',
  // 广场搜索命中的「同学」结果；非搜索态恒为空数组（信息流不渲染 people 区）
  // Square v2 (dual-mode redesign §6.11)
  squareTab: 'recommend',                    // 'recommend' | 'campus_wall'
  newPostBoard: 'recommend',                 // new-post destination (modal radio)
  newPostAnonymous: false,                   // anonymous toggle
  milestoneData: null,
  editTags: [],
  setupTags: [],
  metadataCache: {},
  filterGender: 'all',
  // University stage is a multi-select (match.js): array of whitelisted stages,
  // empty = "Any". Replaces the old singular filterStage.
  filterStages: [],
};
