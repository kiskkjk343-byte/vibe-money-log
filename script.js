/**
 * 머니로그 — 시스템 로직
 */

const CATEGORIES = {
  '식비':         { color:'#EF4444', bg:'#FEF2F2', darkBg:'#3b0d0d', icon:'utensils'      },
  '교통':         { color:'#3B82F6', bg:'#EFF6FF', darkBg:'#0c1e3b', icon:'car'           },
  '쇼핑/생활':    { color:'#10B981', bg:'#ECFDF5', darkBg:'#062a1a', icon:'shopping-bag'  },
  '고정지출':     { color:'#8B5CF6', bg:'#F5F3FF', darkBg:'#1e1040', icon:'repeat'        },
  '경조사':       { color:'#EC4899', bg:'#FDF2F8', darkBg:'#2d0a1f', icon:'gift'          },
  '기타':         { color:'#94A3B8', bg:'#F8FAFC', darkBg:'#141b2d', icon:'help-circle'   },
};

const CUSTOM_CAT_COLORS = [
  { color:'#F59E0B', bg:'#FFFBEB', darkBg:'#2d1f04', icon:'tag' },
  { color:'#06B6D4', bg:'#ECFEFF', darkBg:'#062228', icon:'tag' },
  { color:'#14B8A6', bg:'#F0FDFA', darkBg:'#042822', icon:'tag' },
  { color:'#84CC16', bg:'#F7FEE7', darkBg:'#1a2b05', icon:'tag' },
  { color:'#FB923C', bg:'#FFF7ED', darkBg:'#2d1200', icon:'tag' },
  { color:'#A78BFA', bg:'#F5F3FF', darkBg:'#1e1040', icon:'tag' },
  { color:'#F43F5E', bg:'#FFF1F2', darkBg:'#2d0a12', icon:'tag' },
  { color:'#64748B', bg:'#F8FAFC', darkBg:'#141b2d', icon:'tag' },
];

// 상세 내역 탭 그룹 — '전체'는 null(필터 없음), 나머지는 해당 카테고리 배열
const CAT_GROUPS_FOR_TABS = {
  '전체':      null,
  '식비':      ['식비'],
  '교통':      ['교통'],
  '쇼핑/생활': ['쇼핑/생활'],
  '고정지출':  ['고정지출'],
  '기타':      ['기타'],
};

const SK = { TX: 'vml_transactions', KW: 'vml_keyword_map', DARK: 'vml_dark', LAYOUT: 'vml_layout', FIXED: 'vml_fixed', INCOME: 'vml_income', MEMBERS: 'vml_members', PLAN: 'vml_planned', CUSTOM_CATS: 'vml_custom_cats' };

const MEMBER_COLORS = ['#6366F1','#EC4899','#10B981','#F59E0B','#14B8A6','#8B5CF6','#EF4444','#F97316'];

/* ── 동기화 설정 ── */
const FIREBASE_DB_URL = 'https://money-loge-default-rtdb.firebaseio.com';
const SK_SYNC         = 'vml_sync';
const SYNC_DATA_KEYS  = [SK.TX, SK.KW, SK.FIXED, SK.INCOME, SK.MEMBERS, SK.PLAN, SK.CUSTOM_CATS];
const getSyncCode     = () => localStorage.getItem(SK_SYNC) || null;
const saveSyncCode    = code => code ? localStorage.setItem(SK_SYNC, code) : localStorage.removeItem(SK_SYNC);
const sync = { pushTimer: null, pollTimer: null, lastPushTime: 0, applying: false };

// 동기화 대상 키 변경 시 자동 push (localStorage 인터셉터)
;(function() {
  const KEY_SET = new Set(SYNC_DATA_KEYS);
  const _orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    _orig.call(this, key, value);
    if (this === window.localStorage && KEY_SET.has(key) && !sync.applying) triggerPush();
  };
}());

const state = {
  ym: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  tab: 'dashboard',
  pending: [],
  modalIdx: null,
  chart: null,
  detailTab: '전체',
  rightTab: 'list',
  calDay: null,
  activeMember: 'all',
  inputMember:  null,
  fixedMember:  'all',
};

/* ── 유틸리티 ── */
const fmtAmt    = n => n.toLocaleString('ko-KR') + '원';
const fmtDateKR = s => { if (!s) return '날짜 선택'; const [y,m,d] = s.split('-'); return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`; };
const pad    = s => String(s).padStart(2, '0');
const genId  = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const fmtYM  = (ym) => { const [y, m] = ym.split('-'); return `${y}년 ${parseInt(m)}월`; };
const getPrevYM = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const getKwMap  = () => JSON.parse(localStorage.getItem(SK.KW) || '{}');
const saveKwMap = m => localStorage.setItem(SK.KW, JSON.stringify(m));
const getFixed   = () => JSON.parse(localStorage.getItem(SK.FIXED)  || '[]');
const saveFixed  = arr => localStorage.setItem(SK.FIXED, JSON.stringify(arr));
const getIncome   = () => JSON.parse(localStorage.getItem(SK.INCOME)   || '[]');
const saveIncome  = arr => localStorage.setItem(SK.INCOME, JSON.stringify(arr));
const getPlanned  = () => JSON.parse(localStorage.getItem(SK.PLAN)    || '[]');
const savePlanned = arr => localStorage.setItem(SK.PLAN,   JSON.stringify(arr));
const getMembers  = () => JSON.parse(localStorage.getItem(SK.MEMBERS)  || '[]');
const saveMembers = arr => localStorage.setItem(SK.MEMBERS, JSON.stringify(arr));
const getCustomCats  = () => JSON.parse(localStorage.getItem(SK.CUSTOM_CATS) || '{}');
const saveCustomCats = obj => localStorage.setItem(SK.CUSTOM_CATS, JSON.stringify(obj));
const getAllCategories = () => ({ ...CATEGORIES, ...getCustomCats() });
const saveMth   = (ym, data) => {
  const all = JSON.parse(localStorage.getItem(SK.TX) || '{}');
  all[ym] = data;
  localStorage.setItem(SK.TX, JSON.stringify(all));
};
const refreshIcons = () => { if (window.lucide) window.lucide.createIcons(); };

const showToast = (msg) => {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden', 'fade-out');
  setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.classList.add('hidden'), 300); }, 2600);
};

const DEFAULT_KEYWORD_MAP = {
  '쿠팡이츠':'식비','스타벅스':'식비','컴포즈커피':'식비','하삼동커피':'식비','광안밀면':'식비',
  '진만두가':'식비','수영수제왕돈까스':'식비','고기굽는남자':'식비','철길부산집':'식비','배달의민족':'식비',
  '카카오 택시':'교통','카카오모빌리티':'교통','에스씨(주)우리주유소':'교통',
  '쿠팡':'쇼핑/생활','네이버페이':'쇼핑/생활','신세계':'쇼핑/생활','이마트 에브리데이':'쇼핑/생활',
  'Apple':'쇼핑/생활','지에스(GS)25':'쇼핑/생활','(주)코리아세븐':'쇼핑/생활','올리브영':'쇼핑/생활',
  'LGU+ 통신':'고정지출','아파트관리비':'고정지출','(주)부산도시가스':'고정지출',
  '쿠팡(와우 멤버십)':'고정지출','바로알림서비스':'고정지출',
  '마이리얼트립':'기타','경복궁면세점':'기타','풀무원푸드앤컬처':'기타','마이뱅크':'기타','유전젤':'기타',
};

const BUILTIN_KEYWORD_MAP = {
  // ── 식비: 커피·음료 체인 ──────────────────────────────────────
  '스타벅스':'식비','이디야':'식비','메가MGC커피':'식비','메가커피':'식비',
  '컴포즈커피':'식비','컴포즈':'식비','빽다방':'식비','커피빈':'식비',
  '투썸플레이스':'식비','투썸':'식비','할리스':'식비','탐앤탐스':'식비',
  '엔제리너스':'식비','파스쿠찌':'식비','카페베네':'식비','폴바셋':'식비',
  '드롭탑':'식비','달콤커피':'식비','더벤티':'식비','하삼동커피':'식비',
  '커핀그루나루':'식비','블루보틀':'식비','공차':'식비','쥬씨':'식비',
  '스무디킹':'식비','요거프레소':'식비','더착한커피':'식비','빈스앤베리즈':'식비',
  '감성커피':'식비','매머드커피':'식비','빅오렌지':'식비','커피스미스':'식비',
  '커피베이':'식비','프랭커피':'식비','테일러커피':'식비','앤트러사이트':'식비',
  '모모스커피':'식비','커피나무':'식비','자바시티':'식비','뉴욕커피':'식비',
  '요아정':'식비','소프트리':'식비','콜드스톤':'식비',
  // 식비: 패스트푸드·버거
  '맥도날드':'식비','버거킹':'식비','KFC':'식비','롯데리아':'식비',
  '맘스터치':'식비','서브웨이':'식비','파이브가이즈':'식비','쉐이크쉑':'식비',
  '노브랜드버거':'식비','크라이치즈버거':'식비','슈퍼두퍼':'식비',
  '타코벨':'식비','프랭크버거':'식비','다운타우너':'식비','버거플랜트':'식비',
  // 식비: 피자
  '피자헛':'식비','도미노피자':'식비','도미노':'식비','파파존스':'식비',
  '미스터피자':'식비','반올림피자':'식비','7번가피자':'식비',
  '피자스쿨':'식비','피자마루':'식비','피자나라치킨공주':'식비',
  '피자알볼로':'식비','피자에땅':'식비','오구쌀피자':'식비','고피자':'식비',
  // 식비: 치킨
  '교촌치킨':'식비','교촌':'식비','BHC':'식비','BBQ':'식비',
  '굽네치킨':'식비','굽네':'식비','네네치킨':'식비','처갓집':'식비',
  '멕시카나':'식비','호식이두마리치킨':'식비','호식이':'식비',
  '페리카나':'식비','60계치킨':'식비','푸라닭':'식비',
  '노랑통닭':'식비','지코바치킨':'식비','지코바':'식비',
  '훌랄라':'식비','땅땅치킨':'식비','두찜':'식비','봉구스밥버거':'식비',
  '또래오래':'식비','쌈바닭':'식비','자담치킨':'식비','치킨마루':'식비',
  '부어치킨':'식비','강호동백정':'식비','옛날통닭':'식비','쌀통닭':'식비',
  '치킨플러스':'식비','닭이랑':'식비','맥켄치킨':'식비','치킨매니아':'식비',
  // 식비: 배달 플랫폼
  '배달의민족':'식비','배민':'식비','요기요':'식비','쿠팡이츠':'식비',
  '위메프오':'식비','땡겨요':'식비',
  // 식비: 한식·외식·도시락·베이커리 체인
  '빕스':'식비','아웃백':'식비','한솥':'식비','본죽':'식비','본도시락':'식비',
  '애슐리퀸즈':'식비','애슐리':'식비','올반':'식비','CJ푸드빌':'식비',
  '뚜레쥬르':'식비','파리바게뜨':'식비','파리바게트':'식비',
  '던킨':'식비','크리스피크림':'식비','배스킨라빈스':'식비','나뚜루':'식비',
  '설빙':'식비','망고식스':'식비','리나스':'식비','성심당':'식비','브레댄코':'식비',
  '에그드랍':'식비','이삭토스트':'식비','고봉민김밥':'식비',
  '김가네':'식비','바르다김선생':'식비','한촌설렁탕':'식비','신선설농탕':'식비',
  '신전떡볶이':'식비','죠스떡볶이':'식비','엽기떡볶이':'식비','국대떡볶이':'식비',
  '배떡':'식비','떡볶이의신':'식비','아딸':'식비','선비꼬마김밥':'식비',
  '김밥천국':'식비','원할머니보쌈':'식비','놀부부대찌개':'식비','청년다방':'식비',
  '셰프의테이블':'식비','오봉도시락':'식비','한국맥도날드':'식비',
  '명륜진사갈비':'식비','하남돼지집':'식비','서가앤쿡':'식비','삼겹본능':'식비',
  '연안식당':'식비','큰맘할매순대국':'식비','흥부찜닭':'식비','땅스부대찌개':'식비',
  '홍콩반점0410':'식비','홍콩반점':'식비','차이나팩토리':'식비',
  '스시로':'식비','요시노야':'식비','마루가메제면':'식비',
  '매드포갈릭':'식비','블랙스미스':'식비','계절밥상':'식비',
  '제일제면소':'식비','국수나무':'식비','명동칼국수':'식비',
  '롤링파스타':'식비','빠네파스타':'식비',
  // 식비: 편의점
  'GS25':'식비','CU편의점':'식비','세븐일레븐':'식비','이마트24':'식비','미니스톱':'식비',
  // 식비: 부분 매칭 패턴
  '식당':'식비','밥집':'식비','음식점':'식비','레스토랑':'식비','포차':'식비',
  '횟집':'식비','고기집':'식비','삼겹살':'식비','국밥':'식비','순대국':'식비',
  '순댓국':'식비','떡볶이':'식비','분식':'식비','해장국':'식비','갈비집':'식비',
  '갈비':'식비','곱창':'식비','막창':'식비','설렁탕':'식비','삼계탕':'식비',
  '감자탕':'식비','보쌈':'식비','족발':'식비','초밥':'식비','스시':'식비',
  '라멘':'식비','우동':'식비','소바':'식비','돈가스':'식비','돈까스':'식비',
  '파스타':'식비','베이커리':'식비','카페':'식비','치킨집':'식비','닭갈비':'식비',
  '찜닭':'식비','전골':'식비','찌개':'식비','냉면':'식비','비빔밥':'식비',
  '덮밥':'식비','볶음밥':'식비','김밥':'식비','마라탕':'식비','훠궈':'식비',
  '순두부':'식비','칼국수':'식비','수제비':'식비','매운탕':'식비','뷔페':'식비',
  '이자카야':'식비','쌀국수':'식비','스테이크':'식비','바베큐':'식비',
  '불고기':'식비','제육':'식비','연어':'식비','조개구이':'식비','해물찜':'식비',
  '아귀찜':'식비','짜장':'식비','짬뽕':'식비','탕수육':'식비','삼겹':'식비',
  '만두':'식비','낙지':'식비','수육':'식비','해물탕':'식비','육개장':'식비',
  '추어탕':'식비','꽃게':'식비','대게':'식비','쌈밥':'식비','보리밥':'식비',
  '된장찌개':'식비','청국장':'식비','해장':'식비','막국수':'식비',
  '동태탕':'식비','꼬리곰탕':'식비','도가니탕':'식비','뼈해장국':'식비',
  '직화구이':'식비','구이집':'식비','정육식당':'식비','한우구이':'식비',
  '목살':'식비','항정살':'식비','꼼장어':'식비','쭈꾸미':'식비',
  '오삼불고기':'식비','낙곱새':'식비','꽃등심':'식비','주점':'식비',
  '선술집':'식비','호프집':'식비','치맥':'식비','와인바':'식비',
  '일식당':'식비','중식당':'식비','한식당':'식비','양식당':'식비',
  '태국음식':'식비','인도카레':'식비','양꼬치':'식비','딤섬':'식비',
  '훈제':'식비','도가니':'식비','선지국':'식비','곰탕':'식비',
  '떡국':'식비','순살':'식비','닭발':'식비','마라':'식비',
  '빵집':'식비','도넛':'식비','와플':'식비','크로플':'식비','케이크샵':'식비',
  '아이스크림':'식비','젤라또':'식비','빙수':'식비','팥빙수':'식비',
  '숯불구이':'식비','회전초밥':'식비','오마카세':'식비','해산물':'식비',
  '복어':'식비','민물고기':'식비','장어':'식비','간장게장':'식비',

  // ── 교통 ─────────────────────────────────────────────────────
  '카카오택시':'교통','카카오모빌리티':'교통','타다':'교통',
  '우티':'교통','티맵택시':'교통','아이엠택시':'교통','반반택시':'교통',
  'T머니':'교통','캐시비':'교통','한페이':'교통','원패스':'교통',
  '쏘카':'교통','그린카':'교통','피플카':'교통','딜카':'교통',
  '롯데렌터카':'교통','SK렌터카':'교통','제주렌터카':'교통',
  '하나렌터카':'교통','카모아':'교통','카닥':'교통',
  '대한항공':'교통','아시아나항공':'교통','아시아나':'교통',
  '진에어':'교통','제주항공':'교통','티웨이항공':'교통','티웨이':'교통',
  '이스타항공':'교통','에어서울':'교통','에어부산':'교통','에어프레미아':'교통',
  '플라이강원':'교통','에어로케이':'교통',
  '코레일':'교통','SRT':'교통',
  'GS칼텍스':'교통','SK에너지':'교통','S-OIL':'교통','에쓰오일':'교통',
  '현대오일뱅크':'교통','오일뱅크':'교통','알뜰주유소':'교통','농협주유소':'교통',
  '한국도로공사':'교통','도로공사':'교통',
  '킥고잉':'교통','씽씽':'교통','지쿠터':'교통','라임킥보드':'교통',
  // 교통: 부분 매칭 패턴
  '택시':'교통','지하철':'교통','철도':'교통','기차':'교통','항공':'교통',
  '주유소':'교통','주유':'교통','주차장':'교통','하이패스':'교통',
  '고속도로':'교통','렌터카':'교통','렌트카':'교통','통행료':'교통',
  '충전소':'교통','모빌리티':'교통','리무진':'교통','공항버스':'교통',
  '셔틀버스':'교통','전동킥보드':'교통','따릉이':'교통','카셰어링':'교통',
  '경유':'교통','휘발유':'교통','차량정비':'교통','자동차정비':'교통',
  '대리운전':'교통','발렛파킹':'교통','주차비':'교통',

  // ── 쇼핑/생활 ────────────────────────────────────────────────
  // 백화점·대형마트
  '롯데백화점':'쇼핑/생활','신세계백화점':'쇼핑/생활','현대백화점':'쇼핑/생활',
  'AK플라자':'쇼핑/생활','갤러리아백화점':'쇼핑/생활','갤러리아':'쇼핑/생활',
  'NC백화점':'쇼핑/생활','이마트':'쇼핑/생활','홈플러스':'쇼핑/생활',
  '롯데마트':'쇼핑/생활','코스트코':'쇼핑/생활','하나로마트':'쇼핑/생활',
  'GS더프레시':'쇼핑/생활','농협하나로마트':'쇼핑/생활','메가마트':'쇼핑/생활',
  '이마트트레이더스':'쇼핑/생활','트레이더스':'쇼핑/생활','노브랜드':'쇼핑/생활',
  // 온라인 커머스
  '쿠팡':'쇼핑/생활','11번가':'쇼핑/생활','G마켓':'쇼핑/생활','지마켓':'쇼핑/생활',
  '옥션':'쇼핑/생활','위메프':'쇼핑/생활','티몬':'쇼핑/생활',
  '롯데온':'쇼핑/생활','SSG닷컴':'쇼핑/생활','신세계몰':'쇼핑/생활',
  '네이버쇼핑':'쇼핑/생활','네이버페이':'쇼핑/생활','카카오선물하기':'쇼핑/생활',
  '마켓컬리':'쇼핑/생활','컬리':'쇼핑/생활','오아시스마켓':'쇼핑/생활',
  '현대몰':'쇼핑/생활','AK몰':'쇼핑/생활','LF몰':'쇼핑/생활',
  '알리익스프레스':'쇼핑/생활','알리바바':'쇼핑/생활','테무':'쇼핑/생활',
  // 홈쇼핑
  'GS홈쇼핑':'쇼핑/생활','CJ온스타일':'쇼핑/생활','롯데홈쇼핑':'쇼핑/생활',
  '현대홈쇼핑':'쇼핑/생활','NS홈쇼핑':'쇼핑/생활','공영홈쇼핑':'쇼핑/생활',
  // 뷰티·드럭스토어
  '올리브영':'쇼핑/생활','다이소':'쇼핑/생활','세포라':'쇼핑/생활',
  '아리따움':'쇼핑/생활','이니스프리':'쇼핑/생활','에뛰드':'쇼핑/생활',
  '미샤':'쇼핑/생활','더페이스샵':'쇼핑/생활','네이처리퍼블릭':'쇼핑/생활',
  '토니모리':'쇼핑/생활','스킨푸드':'쇼핑/생활','잇츠스킨':'쇼핑/생활',
  '랄라블라':'쇼핑/생활','롭스':'쇼핑/생활','왓슨스':'쇼핑/생활','시코르':'쇼핑/생활',
  '클리오':'쇼핑/생활','롬앤':'쇼핑/생활','조선미녀':'쇼핑/생활','설화수':'쇼핑/생활',
  '헤라':'쇼핑/생활','아이오페':'쇼핑/생활','라네즈':'쇼핑/생활','VDL':'쇼핑/생활',
  // 패션·스포츠
  'ZARA':'쇼핑/생활','자라':'쇼핑/생활','H&M':'쇼핑/생활','에이치앤엠':'쇼핑/생활',
  '유니클로':'쇼핑/생활','스파오':'쇼핑/생활','탑텐':'쇼핑/생활',
  '지오다노':'쇼핑/생활','무신사':'쇼핑/생활','에이블리':'쇼핑/생활',
  '브랜디':'쇼핑/생활','W컨셉':'쇼핑/생활','29CM':'쇼핑/생활',
  '지그재그':'쇼핑/생활','에잇세컨즈':'쇼핑/생활','8seconds':'쇼핑/생활',
  '크림':'쇼핑/생활','퀸잇':'쇼핑/생활',
  '나이키':'쇼핑/생활','아디다스':'쇼핑/생활','뉴발란스':'쇼핑/생활',
  '아식스':'쇼핑/생활','리복':'쇼핑/생활','퓨마':'쇼핑/생활','컨버스':'쇼핑/생활',
  'MLB':'쇼핑/생활','라코스테':'쇼핑/생활','폴로':'쇼핑/생활','휠라':'쇼핑/생활',
  '노스페이스':'쇼핑/생활','블랙야크':'쇼핑/생활','K2아웃도어':'쇼핑/생활',
  '네파':'쇼핑/생활','밀레':'쇼핑/생활','아이더':'쇼핑/생활',
  '코오롱스포츠':'쇼핑/생활','디스커버리익스페디션':'쇼핑/생활',
  '프로스펙스':'쇼핑/생활','르까프':'쇼핑/생활','데상트':'쇼핑/생활',
  'ABC마트':'쇼핑/생활','풋로커':'쇼핑/생활',
  // 전자제품
  '하이마트':'쇼핑/생활','전자랜드':'쇼핑/생활','삼성디지털플라자':'쇼핑/생활',
  'LG베스트샵':'쇼핑/생활','애플스토어':'쇼핑/생활','Apple':'쇼핑/생활',
  // 가구·인테리어·생활
  'IKEA':'쇼핑/생활','이케아':'쇼핑/생활','한샘':'쇼핑/생활',
  '에몬스가구':'쇼핑/생활','리바트':'쇼핑/생활','까사미아':'쇼핑/생활',
  '현대리바트':'쇼핑/생활','퍼시스':'쇼핑/생활','일룸':'쇼핑/생활',
  '에이스침대':'쇼핑/생활','시몬스':'쇼핑/생활','자주':'쇼핑/생활',
  'MUJI':'쇼핑/생활','무인양품':'쇼핑/생활','모던하우스':'쇼핑/생활',
  // 서점
  '교보문고':'쇼핑/생활','반디앤루니스':'쇼핑/생활','영풍문고':'쇼핑/생활',
  '알라딘':'쇼핑/생활','YES24':'쇼핑/생활','예스24':'쇼핑/생활',
  // 문화·여가
  'CGV':'쇼핑/생활','롯데시네마':'쇼핑/생활','메가박스':'쇼핑/생활',
  // 헤어·미용 프랜차이즈
  '준오헤어':'쇼핑/생활','박승철헤어스튜디오':'쇼핑/생활','이가자헤어비스':'쇼핑/생활',
  '리안헤어':'쇼핑/생활','아도르헤어':'쇼핑/생활',
  // 피트니스 프랜차이즈
  '애니타임피트니스':'쇼핑/생활','스포애니':'쇼핑/생활','일레븐짐':'쇼핑/생활',
  '커브스':'쇼핑/생활','위더스':'쇼핑/생활','메가필라테스':'쇼핑/생활',
  '리포메필라테스':'쇼핑/생활','필라피티':'쇼핑/생활',
  // 왁싱·네일
  '왁스나인':'쇼핑/생활','아나덴왁싱':'쇼핑/생활',
  // 쇼핑/생활: 부분 매칭 패턴
  '마트':'쇼핑/생활','슈퍼마켓':'쇼핑/생활','백화점':'쇼핑/생활',
  '쇼핑몰':'쇼핑/생활','아울렛':'쇼핑/생활','의류':'쇼핑/생활',
  '패션':'쇼핑/생활','신발':'쇼핑/생활','운동화':'쇼핑/생활',
  '가방':'쇼핑/생활','악세서리':'쇼핑/생활','악세사리':'쇼핑/생활',
  '화장품':'쇼핑/생활','뷰티':'쇼핑/생활','가전제품':'쇼핑/생활',
  '인테리어':'쇼핑/생활','가구':'쇼핑/생활','침구':'쇼핑/생활',
  '미용실':'쇼핑/생활','헤어샵':'쇼핑/생활','헤어살롱':'쇼핑/생활',
  '네일샵':'쇼핑/생활','네일아트':'쇼핑/생활','왁싱샵':'쇼핑/생활',
  '속눈썹':'쇼핑/생활','눈썹':'쇼핑/생활','필라테스':'쇼핑/생활',
  '요가':'쇼핑/생활','헬스장':'쇼핑/생활','헬스클럽':'쇼핑/생활',
  '피트니스':'쇼핑/생활','수영장':'쇼핑/생활','스포츠센터':'쇼핑/생활',
  '골프':'쇼핑/생활','테니스':'쇼핑/생활','스크린골프':'쇼핑/생활',
  '노래방':'쇼핑/생활','PC방':'쇼핑/생활','볼링':'쇼핑/생활',
  '당구장':'쇼핑/생활','탁구장':'쇼핑/생활','스키장':'쇼핑/생활',
  '편의점':'쇼핑/생활','잡화':'쇼핑/생활','서점':'쇼핑/생활',
  '도서':'쇼핑/생활','문구':'쇼핑/생활','영화관':'쇼핑/생활',
  '세탁소':'쇼핑/생활','세탁':'쇼핑/생활','클리닝':'쇼핑/생활',
  '주방용품':'쇼핑/생활','생활용품':'쇼핑/생활','위생용품':'쇼핑/생활',
  '홈쇼핑':'쇼핑/생활','드럭스토어':'쇼핑/생활','리셀':'쇼핑/생활',
  '스포츠용품':'쇼핑/생활','아웃도어':'쇼핑/생활',

  // ── 고정지출 ─────────────────────────────────────────────────
  // 통신사·인터넷
  'SK텔레콤':'고정지출','SKT':'고정지출','LGU+':'고정지출',
  'LG유플러스':'고정지출','헬로모바일':'고정지출',
  '알뜰폰':'고정지출','스카이라이프':'고정지출','딜라이브':'고정지출',
  'KT엠모바일':'고정지출','SK7모바일':'고정지출','리브모바일':'고정지출',
  'SK브로드밴드':'고정지출','LG헬로비전':'고정지출',
  // 공과금·관리
  '한국전력':'고정지출','한전':'고정지출','도시가스':'고정지출',
  '한국가스공사':'고정지출','수도사업소':'고정지출',
  // 보험: 생명보험
  '삼성생명':'고정지출','한화생명':'고정지출','교보생명':'고정지출',
  '미래에셋생명':'고정지출','신한라이프':'고정지출','동양생명':'고정지출',
  'NH농협생명':'고정지출','흥국생명':'고정지출','라이나생명':'고정지출',
  'ABL생명':'고정지출','DB생명':'고정지출','메트라이프':'고정지출',
  '푸본현대생명':'고정지출','AIA생명':'고정지출',
  // 보험: 손해보험
  '삼성화재':'고정지출','현대해상':'고정지출','DB손해보험':'고정지출',
  'KB손해보험':'고정지출','KB손보':'고정지출','메리츠화재':'고정지출',
  '한화손해보험':'고정지출','롯데손해보험':'고정지출','흥국화재':'고정지출',
  '농협손해보험':'고정지출','MG손해보험':'고정지출','AXA손해보험':'고정지출',
  '캐롯손해보험':'고정지출','캐롯보험':'고정지출',
  // OTT·스트리밍
  '넷플릭스':'고정지출','왓챠':'고정지출','웨이브':'고정지출',
  '티빙':'고정지출','시즌':'고정지출','쿠팡플레이':'고정지출',
  '디즈니플러스':'고정지출','애플TV+':'고정지출',
  // 음악·미디어
  '멜론':'고정지출','지니뮤직':'고정지출','플로':'고정지출',
  '바이브':'고정지출','스포티파이':'고정지출','애플뮤직':'고정지출',
  '유튜브프리미엄':'고정지출','유튜브뮤직':'고정지출',
  // 웹툰·콘텐츠
  '카카오페이지':'고정지출','네이버웹툰':'고정지출','시리즈온':'고정지출',
  // 구독 서비스
  '밀리의서재':'고정지출','리디북스':'고정지출','리디':'고정지출',
  '교보ebook':'고정지출','북클럽':'고정지출','윌라':'고정지출',
  '쿠팡와우':'고정지출','네이버플러스':'고정지출',
  '어도비':'고정지출','마이크로소프트':'고정지출','구글스토리지':'고정지출',
  '드롭박스':'고정지출','노션':'고정지출','한컴오피스':'고정지출',
  // 교육 구독
  '웅진씽크빅':'고정지출','대교':'고정지출','눈높이':'고정지출',
  '빨간펜':'고정지출','윤선생':'고정지출','야나두':'고정지출',
  '클래스101':'고정지출','콜로소':'고정지출','패스트캠퍼스':'고정지출',
  '탈잉':'고정지출','메가스터디':'고정지출','이투스':'고정지출',
  '해커스':'고정지출','시원스쿨':'고정지출',
  // 고정지출: 부분 매칭 패턴
  '관리비':'고정지출','월세':'고정지출','전기요금':'고정지출',
  '가스요금':'고정지출','수도요금':'고정지출','통신비':'고정지출',
  '보험료':'고정지출','구독료':'고정지출','이용료':'고정지출',
  '월정액':'고정지출','아파트관리':'고정지출','공과금':'고정지출',
  '연회비':'고정지출','인터넷요금':'고정지출','전기세':'고정지출',
  '가스비':'고정지출','수도세':'고정지출','임대료':'고정지출',
};

const categorize = (merchant) => {
  const m = merchant.toLowerCase();
  const userMap = getKwMap();

  // 사용자 키워드 우선 (더 긴 키워드가 더 구체적이므로 길이 내림차순)
  const userMatch = Object.entries(userMap)
    .filter(([kw]) => m.includes(kw.toLowerCase()))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (userMatch) return userMatch[1];

  // 내장 키워드 (길이 내림차순으로 최장 일치)
  const builtinMatch = Object.entries(BUILTIN_KEYWORD_MAP)
    .filter(([kw]) => m.includes(kw.toLowerCase()))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (builtinMatch) return builtinMatch[1];

  return '기타';
};

const SAMPLE_RAW_TEXT = `2026.04.29 | 스타벅스 | 4,500원
2026.04.29 | 쿠팡이츠 | 23,000원
2026.04.30 | 이마트 에브리데이 부산반여점 | 8,800원
2026.04.30 | 카카오 택시 | 12,000원`;

/* ── 텍스트 파싱 ── */
function parseText(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  let cur = null;

  const reDate   = /(\d{4})[.\-](\d{2})[.\-](\d{2})/;
  const reAmt    = /(-?[\d,]+)\s*원/;
  const reInst   = /할부\s*\d+|(\d+)\s*\/\s*\d+\s*개월|\d+개월/;

  for (const line of lines) {
    // 탭 구분 행 (PDF 위치기반 추출 결과)
    const parts = line.split('\t').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const dm = parts[0].match(reDate);
      if (dm) {
        if (cur) results.push(cur);
        const date     = `${dm[1]}-${dm[2]}-${dm[3]}`;
        const merchant = parts[1] || '';
        const amtRaw   = parts[2] || '';
        const am       = amtRaw.match(/(-?[\d,]+)/);
        const amount   = am ? parseInt(am[1].replace(/,/g, '')) : 0;
        if (merchant) {
          cur = {
            id: genId(), date, merchant,
            amount: Math.abs(amount),
            category: categorize(merchant),
            isInstallment: reInst.test(line),
            isCancelled: amount < 0,
          };
        }
        continue;
      }
    }

    // 일반 파이프/공백 구분 행
    const dm = line.match(reDate);
    const am = line.match(reAmt);

    if (dm) {
      if (cur) results.push(cur);
      const date = `${dm[1]}-${dm[2]}-${dm[3]}`;
      let merchant = line.replace(dm[0], '').replace(/\|/g, '').trim();
      let amount   = 0;
      if (am) {
        amount   = parseInt(am[1].replace(/,/g, ''));
        merchant = merchant.replace(am[0], '').trim();
      }
      merchant = merchant.replace(reInst, '').replace(/\s+/g, ' ').trim();
      cur = {
        id: genId(), date, merchant,
        amount: Math.abs(amount),
        category: categorize(merchant),
        isInstallment: reInst.test(line),
        isCancelled: amount < 0,
      };
    } else if (cur) {
      const cleanLine = line.replace(/\|/g, '').trim();
      if (am && cur.amount === 0) {
        const n = parseInt(am[1].replace(/,/g, ''));
        cur.amount      = Math.abs(n);
        cur.isCancelled = n < 0;
      } else if (cleanLine && !am) {
        cur.merchant += ' ' + cleanLine;
        cur.merchant  = cur.merchant.replace(/\s+/g, ' ').trim();
        cur.category  = categorize(cur.merchant);
      }
    }
  }
  if (cur) results.push(cur);

  // 필수값 검증: 날짜·사용처·금액 모두 있어야 저장
  return results.filter(tx => tx.date && tx.merchant && tx.amount > 0);
}

/* ── CSV 텍스트 → 2D 배열 (BOM 제거 + 따옴표 필드 처리) ── */
function parseCSVToRows(text) {
  const clean = text.replace(/^﻿/, '');
  const rows = [];
  for (const line of clean.split('\n')) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

/* ── Excel/CSV 행 직접 파싱 (헤더 자동 감지) ── */
function parseExcelRows(rows) {
  const headerIdx = rows.findIndex(row =>
    Array.isArray(row) &&
    row.some(c => /날짜|일자|이용일|승인일|거래일시|거래일/.test(String(c))) &&
    row.some(c => /가맹점|상호|이용처|사용처|이용내역|적요|거래처|내용/.test(String(c)))
  );
  if (headerIdx === -1) return null;

  const header = rows[headerIdx].map(c => String(c));
  const dateCol     = header.findIndex(c => /날짜|일자|이용일|승인일|거래일시|거래일/.test(c));
  const merchantCol = header.findIndex(c => /가맹점|상호|이용처|사용처|이용내역|적요|거래처|내용/.test(c));
  const amountCol   = header.findIndex(c => /이용금액|사용금액|출금금액|금액/.test(c));
  const typeCol     = header.findIndex(c => /거래종류|구분|거래유형/.test(c));
  if (merchantCol === -1) return null;

  const results = [];
  for (const row of rows.slice(headerIdx + 1)) {
    if (!Array.isArray(row)) continue;
    const dateRaw     = String(row[dateCol]     ?? '').trim();
    const merchantRaw = String(row[merchantCol] ?? '').trim();
    const amountRaw   = String(row[amountCol]   ?? '').trim();
    const typeRaw     = typeCol >= 0 ? String(row[typeCol] ?? '').trim() : '';
    if (!merchantRaw) continue;

    // 입금/이자 행 제외 (토스뱅크 등)
    if (typeRaw && /입금|이자|환급/.test(typeRaw)) continue;

    let date = '';
    const dm = dateRaw.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (dm) date = `${dm[1]}-${dm[2].padStart(2,'0')}-${dm[3].padStart(2,'0')}`;
    else if (dateRaw) date = state.ym + '-01';
    else continue;

    const amountNum = parseInt(amountRaw.replace(/[^0-9\-]/g, '') || '0');
    if (amountNum === 0) continue;

    const isCancelled = /취소/.test(typeRaw) || amountNum < 0;

    results.push({
      id: genId(), date, merchant: merchantRaw,
      amount: Math.abs(amountNum),
      category: categorize(merchantRaw),
      isInstallment: false,
      isCancelled,
    });
  }
  return results.length > 0 ? results : null;
}

/* ── PDF 텍스트 추출 (Y 좌표 기반 행 재구성) ── */
async function extractPdfText(typedarray) {
  const pdf = await pdfjsLib.getDocument(typedarray).promise;
  let fullText = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent({ normalizeWhitespace: true });

    const rowMap = {};
    for (const item of content.items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!rowMap[y]) rowMap[y] = [];
      rowMap[y].push({ str: item.str, x: item.transform[4] });
    }
    const sortedYs = Object.keys(rowMap).map(Number).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const cols = rowMap[y].sort((a, b) => a.x - b.x);
      fullText += cols.map(c => c.str).join('\t') + '\n';
    }
  }
  return fullText;
}

/* ── 파일 업로드 처리 ── */
const readFile = async (file) => {
  const updateUI = (name, size) => {
    document.getElementById('uploadFileName').textContent = name;
    document.getElementById('uploadFileSize').textContent = (size / 1024).toFixed(1) + 'KB';
    document.getElementById('uploadDefault').classList.add('hidden');
    document.getElementById('uploadSuccess').classList.remove('hidden');
  };

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        showToast('PDF 분석 중...');
        const text = await extractPdfText(new Uint8Array(e.target.result));
        document.getElementById('statementInput').value = text;
        updateUI(file.name, file.size);
        showToast('PDF 텍스트 추출 완료 ✓');
        window.parseStatement();
      } catch (err) {
        console.error('PDF 파싱 에러:', err);
        showToast(err.name === 'PasswordException'
          ? '비밀번호 보호된 PDF입니다. 암호 해제 후 시도해주세요.'
          : 'PDF 분석 실패. 텍스트를 직접 붙여넣어 주세요.');
      }
    };
    reader.readAsArrayBuffer(file);

  } else if (/\.xlsx?$/i.test(file.name)) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        showToast('Excel 분석 중...');
        const wb   = XLSX.read(e.target.result, { type: 'binary' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const parsed = parseExcelRows(rows);
        if (parsed) {
          state.pending = parsed;
          updateUI(file.name, file.size);
          renderPreview();
          showToast(`Excel 분석 완료 — ${parsed.length}건 ✓`);
        } else {
          const csv = XLSX.utils.sheet_to_csv(ws, { FS: '\t' });
          document.getElementById('statementInput').value = csv;
          updateUI(file.name, file.size);
          window.parseStatement();
          showToast('Excel 추출 완료 ✓');
        }
      } catch (err) {
        showToast('Excel 읽기 실패: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);

  } else if (/\.csv$/i.test(file.name)) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        showToast('CSV 분석 중...');
        const text = e.target.result;
        const rows = parseCSVToRows(text);
        const parsed = parseExcelRows(rows);
        if (parsed) {
          state.pending = parsed;
          updateUI(file.name, file.size);
          renderPreview();
          showToast(`CSV 분석 완료 — ${parsed.length}건 ✓`);
        } else {
          document.getElementById('statementInput').value = text.replace(/^﻿/, '');
          updateUI(file.name, file.size);
          window.parseStatement();
          showToast('CSV 분석 완료 ✓');
        }
      } catch (err) {
        showToast('CSV 읽기 실패: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');

  } else {
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('statementInput').value = e.target.result;
      updateUI(file.name, file.size);
      window.parseStatement();
    };
    reader.readAsText(file);
  }
};

function showConfirm(title, desc, onOk, okLabel = '삭제', okColor = '#EF4444') {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmDesc').textContent  = desc;
  const btn = document.getElementById('confirmOkBtn');
  btn.textContent   = okLabel;
  btn.style.background = okColor;
  btn.onclick = () => { onOk(); closeConfirm(); };
  document.getElementById('confirmModal').classList.remove('hidden');
}
function closeConfirm() { document.getElementById('confirmModal').classList.add('hidden'); }

/* ── 다크모드 & 레이아웃 ── */
function toggleDark() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem(SK.DARK, isDark);
  syncUI();
  if (state.tab === 'dashboard') renderDashboard();
}

function toggleLayout() {
  const isPc = document.documentElement.classList.toggle('pc-mode');
  localStorage.setItem(SK.LAYOUT, isPc ? 'pc' : 'mobile');
  syncUI();
}

function syncUI() {
  const isDark = document.documentElement.classList.contains('dark');
  const isPc   = document.documentElement.classList.contains('pc-mode');

  const darkBtn = document.getElementById('darkBtn');
  if (darkBtn) {
    darkBtn.classList.toggle('on', isDark);
    document.getElementById('darkLabel').textContent = isDark ? '라이트' : '다크';
    document.getElementById('darkIcon').setAttribute('data-lucide', isDark ? 'sun' : 'moon');
  }
  const layoutBtn = document.getElementById('layoutBtn');
  if (layoutBtn) {
    layoutBtn.classList.toggle('on', isPc);
    document.getElementById('layoutLabel').textContent = isPc ? '모바일' : 'PC';
    document.getElementById('layoutIcon').setAttribute('data-lucide', isPc ? 'smartphone' : 'monitor');
  }
  refreshIcons();
}

/* ── 탭 전환 ── */
function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('tab-active'));
  const targetTab = document.getElementById(`tab-${tab}`);
  if (targetTab) targetTab.classList.remove('hidden');
  const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
  if (activeBtn) activeBtn.classList.add('tab-active');
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'fixed')     renderFixed();
  if (tab === 'income')    renderIncome();
  if (tab === 'plan')      renderPlanned();
  if (tab === 'input')     renderInputMemberSelector();
  refreshIcons();
}

function renderPreview() {
  const countEl = document.getElementById('previewCount');
  if (countEl) countEl.textContent = `${state.pending.length}건`;

  const list = document.getElementById('previewList');
  list.innerHTML = state.pending.map((tx, i) => `
    <div class="divider-row" style="display:flex;justify-content:space-between;padding:10px 15px;">
      <div>
        <div style="font-weight:600;font-size:13px;">${tx.merchant}</div>
        <div style="font-size:11px;color:${CATEGORIES[tx.category]?.color || 'var(--t4)'};font-weight:600;">${tx.category}</div>
        <div style="font-size:10px;color:var(--t5)">${tx.date}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <button onclick="openCategoryModal(${i})" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:5px;background:none;color:var(--t3);cursor:pointer;">변경</button>
        <div style="font-weight:700;${tx.isCancelled ? 'color:#EF4444' : ''}">${fmtAmt(tx.amount)}</div>
      </div>
    </div>
  `).join('');
  document.getElementById('parsePreview').classList.remove('hidden');
  refreshIcons();
}

/* ── 대시보드 렌더링 ── */
function renderDashboard() {
  const all        = JSON.parse(localStorage.getItem(SK.TX) || '{}');
  const allTxs     = all[state.ym]              || [];
  const allPrevTxs = all[getPrevYM(state.ym)]   || [];
  const txs     = state.activeMember === 'all' ? allTxs     : allTxs.filter(t => t.memberId === state.activeMember);
  const prevTxs = state.activeMember === 'all' ? allPrevTxs : allPrevTxs.filter(t => t.memberId === state.activeMember);

  const active     = txs.filter(t => !t.isCancelled);
  const total      = active.reduce((s, t) => s + t.amount, 0);
  const prevActive = prevTxs.filter(t => !t.isCancelled);
  const prevTotal  = prevActive.reduce((s, t) => s + t.amount, 0);

  document.getElementById('totalAmount').textContent = fmtAmt(total);
  document.getElementById('monthLabel').textContent  = fmtYM(state.ym);
  const txCountEl = document.getElementById('txCount');
  if (txCountEl) {
    const incomeTotal = getIncome().reduce((s, i) => s + i.amount, 0);
    if (incomeTotal > 0 && total > 0) {
      const ratio = Math.round(total / incomeTotal * 100);
      const col = ratio > 80 ? '#EF4444' : ratio > 50 ? '#F59E0B' : '#10B981';
      txCountEl.innerHTML = `${active.length}건 &nbsp;·&nbsp; 수입 대비 <span style="color:${col};font-weight:700">${ratio}%</span> 지출`;
    } else {
      txCountEl.textContent = `${active.length}건`;
    }
  }

  const badge = document.getElementById('momBadge');
  if (prevTotal > 0) {
    const diff = total - prevTotal;
    const pct  = Math.round(Math.abs(diff / prevTotal) * 100);
    const [bg, fg, sym] = diff > 0
      ? ['#FEF2F2','#EF4444','▲'] : diff < 0
      ? ['#EFF6FF','#3B82F6','▼']
      : ['var(--bg-inset)','var(--t4)','='];
    badge.innerHTML = `<span class="num" style="font-size:.6875rem;font-weight:700;background:${bg};color:${fg};border-radius:9999px;padding:.25rem .625rem">${sym} ${fmtAmt(Math.abs(diff))} (${pct}%)</span>`;
  } else {
    badge.innerHTML = `<span style="font-size:.6875rem;color:var(--t5)">전월 데이터 없음</span>`;
  }

  renderChart(active);
  renderMomComparison(active, prevActive);

  const clearBtn = document.getElementById('clearMonthBtn');
  if (clearBtn) clearBtn.classList.toggle('hidden', txs.length === 0);

  const demoBadge = document.getElementById('demoBadge');
  if (demoBadge) demoBadge.classList.toggle('hidden', !hasDemoData());

  if (state.rightTab === 'calendar') {
    const listCountEl = document.getElementById('listCount');
    if (listCountEl) listCountEl.textContent = `${active.length}건`;
    renderCalendar(txs);
  } else {
    renderDetailTabs();
    renderTxList(txs);
  }

  renderMemberPills(allTxs);
  if (state.activeMember === 'all') {
    renderMemberBreakdown(allTxs);
  } else {
    const bdCard = document.getElementById('memberBreakdownCard');
    if (bdCard) bdCard.classList.add('hidden');
  }
}

function renderChart(txs) {
  if (state.chart) { state.chart.destroy(); state.chart = null; }
  const canvas    = document.getElementById('categoryChart');
  const noDataEl  = document.getElementById('noDataChart');
  const wrapperEl = document.getElementById('chartWrapper');
  const centerEl  = document.getElementById('chartCenter');
  const legendEl  = document.getElementById('categoryLegend');

  if (!canvas || txs.length === 0) {
    noDataEl?.classList.remove('hidden');
    wrapperEl?.classList.add('hidden');
    return;
  }
  noDataEl?.classList.add('hidden');
  wrapperEl?.classList.remove('hidden');

  const totals = txs.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc; }, {});
  const grand  = Object.values(totals).reduce((s, v) => s + v, 0);

  if (centerEl) centerEl.textContent = fmtAmt(grand);

  if (legendEl) {
    legendEl.innerHTML = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => {
        const pct  = Math.round(amt / grand * 100);
        const info = CATEGORIES[cat] || { color:'#94A3B8' };
        return `<div style="display:flex;align-items:center;gap:.5rem">
          <span style="width:.5rem;height:.5rem;border-radius:50%;background:${info.color};flex-shrink:0"></span>
          <span style="font-size:.6875rem;color:var(--t3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cat}</span>
          <span class="num" style="font-size:.6875rem;font-weight:700;color:var(--t2)">${pct}%</span>
          <span class="num" style="font-size:.6875rem;color:var(--t4)">${fmtAmt(amt)}</span>
        </div>`;
      }).join('');
  }

  state.chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: Object.keys(totals),
      datasets: [{
        data: Object.values(totals),
        backgroundColor: Object.keys(totals).map(c => CATEGORIES[c]?.color || '#94A3B8'),
        borderWidth: 2,
        borderColor: document.documentElement.classList.contains('dark') ? '#141B2D' : '#FFFFFF',
      }],
    },
    options: { cutout: '70%', plugins: { legend: { display: false } } },
  });
}

function renderMomComparison(txs, prevTxs) {
  const el = document.getElementById('momComparison');
  if (!el) return;
  const cur  = txs.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc; }, {});
  const prev = prevTxs.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc; }, {});
  const cats = [...new Set([...Object.keys(cur), ...Object.keys(prev)])];
  if (cats.length === 0) {
    el.innerHTML = `<p style="font-size:.75rem;color:var(--t5);text-align:center;padding:1rem 0">데이터 없음</p>`;
    return;
  }
  el.innerHTML = cats.sort().map(cat => {
    const c = cur[cat] || 0, p = prev[cat] || 0, diff = c - p;
    const col  = diff > 0 ? '#EF4444' : diff < 0 ? '#3B82F6' : 'var(--t4)';
    const sign = diff > 0 ? '+' : '';
    const info = CATEGORIES[cat] || { color:'#94A3B8' };
    return `<div style="display:flex;align-items:center;gap:.5rem;padding:.375rem 0;border-bottom:1px solid var(--divider)">
      <span style="width:.5rem;height:.5rem;border-radius:50%;background:${info.color};flex-shrink:0"></span>
      <span style="flex:1;font-size:.75rem;color:var(--t2)">${cat}</span>
      <span class="num" style="font-size:.75rem;font-weight:700;color:var(--t2)">${fmtAmt(c)}</span>
      ${diff !== 0 ? `<span class="num" style="font-size:.6875rem;color:${col};font-weight:600">${sign}${fmtAmt(Math.abs(diff))}</span>` : ''}
    </div>`;
  }).join('');
}

function renderDetailTabs() {
  const container = document.getElementById('detailTabs');
  if (!container) return;
  container.innerHTML = Object.keys(CAT_GROUPS_FOR_TABS).map(tab => `
    <button class="detail-tab-btn ${state.detailTab === tab ? 'active' : ''}"
            onclick="switchDetailTab('${tab}')">
      ${tab}
    </button>
  `).join('');
}

function switchDetailTab(tab) {
  state.detailTab = tab;
  renderDetailTabs();
  const all = JSON.parse(localStorage.getItem(SK.TX) || '{}');
  renderTxList(all[state.ym] || []);
}

function renderTxList(txs) {
  const list = document.getElementById('transactionList');
  if (!list) return;

  let filtered = txs;
  if (state.detailTab !== '전체') {
    const targets = CAT_GROUPS_FOR_TABS[state.detailTab];
    if (targets) filtered = txs.filter(tx => targets.includes(tx.category));
  }

  const listCountEl = document.getElementById('listCount');
  if (listCountEl) listCountEl.textContent = `${filtered.length}건`;

  if (filtered.length === 0) {
    list.innerHTML = `<p style="text-align:center;color:var(--t5);padding:2rem 0;font-size:0.8rem">내역이 없습니다</p>`;
    return;
  }
  list.innerHTML = filtered.sort((a, b) => b.date.localeCompare(a.date)).map(tx => `
    <div class="divider-row" style="display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:13px;">
        <div style="font-weight:600;">${tx.merchant}</div>
        <div style="font-size:11px;color:${CATEGORIES[tx.category]?.color || 'var(--t4)'};font-weight:600;">${tx.category}</div>
        <div style="font-size:10px;color:var(--t5)">${tx.date}</div>
      </div>
      <div style="font-weight:700;${tx.isCancelled ? 'color:#EF4444;' : ''}">${tx.isCancelled ? '-' : ''}${fmtAmt(tx.amount)}</div>
    </div>
  `).join('');
}

function renderKeywords() {
  const map = getKwMap();
  const container = document.getElementById('keywordsByCategory');
  if (!container) return;

  const builtinCount = Object.keys(BUILTIN_KEYWORD_MAP).length;
  const entries = Object.entries(map);

  // 카테고리별 그룹핑
  const byCat = {};
  entries.forEach(([kw, cat]) => {
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(kw);
  });

  const userHtml = entries.length === 0
    ? `<p style="font-size:.8125rem;color:var(--t4);text-align:center;padding:.875rem 0">추가된 키워드가 없습니다<br><span style="font-size:.6875rem;color:var(--t5);margin-top:.25rem;display:block">키워드 추가 시 기본 분류보다 우선 적용됩니다</span></p>`
    : Object.entries(byCat).map(([cat, kws]) => `
        <div style="margin-bottom:.625rem">
          <div style="font-size:.625rem;font-weight:700;color:var(--t3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:.25rem">${cat}</div>
          ${kws.map(kw => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid var(--divider)">
              <span style="font-size:.8125rem;color:var(--t1);font-weight:500">${kw}</span>
              <button onclick="removeKeyword('${kw.replace(/'/g, "\\'")}')" style="color:var(--t4);background:none;border:none;cursor:pointer;font-size:.6875rem;padding:.2rem .5rem;border-radius:.375rem;transition:color .15s" onmouseover="this.style.color='#EF4444'" onmouseout="this.style.color='var(--t4)'">삭제</button>
            </div>
          `).join('')}
        </div>
      `).join('');

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:.5rem;background:color-mix(in srgb,#6366F1 8%,var(--bg-inset));border:1px solid #6366F120;border-radius:.625rem;padding:.5rem .75rem;margin-bottom:.875rem">
      <span style="font-size:.75rem;color:#6366F1">✦</span>
      <span style="font-size:.75rem;color:var(--t2)">기본 내장 키워드 <b>${builtinCount}개</b> 자동 적용 중</span>
      <span style="font-size:.6875rem;color:var(--t4);margin-left:auto">내 키워드가 우선</span>
    </div>
    <div style="font-size:.625rem;font-weight:700;color:var(--t3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:.375rem">내 키워드 (${entries.length}개)</div>
    ${userHtml}
  `;

  const sel = document.getElementById('newCategory');
  if (sel) sel.innerHTML = Object.keys(getAllCategories()).map(c => `<option value="${c}">${c}</option>`).join('');
}

function openCategoryModal(idx) {
  state.modalIdx = idx;
  const tx = state.pending[idx];
  document.getElementById('modalMerchant').textContent = `${tx.merchant} (${fmtAmt(tx.amount)})`;
  document.getElementById('categoryOptions').innerHTML = Object.keys(getAllCategories()).map(cat => `
    <button onclick="selectCategory('${cat}')" style="padding:8px;font-size:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);cursor:pointer;">${cat}</button>
  `).join('');
  document.getElementById('categoryModal').classList.remove('hidden');
}

function closeModal() { document.getElementById('categoryModal').classList.add('hidden'); }

/* ── 고정지출 계획 ── */
const fixedGroupState = {};

function renderFixed() {
  const allList = getFixed();
  const members = getMembers();
  const hasMem  = members.length > 0;
  const allCats = getAllCategories();

  // ── 멤버 필터 필 ──
  const filterEl = document.getElementById('fixedMemberFilter');
  if (filterEl) {
    if (!hasMem) {
      filterEl.style.display = 'none';
    } else {
      filterEl.style.display = 'flex';
      const pills = [
        { id: 'all',    label: '전체', color: '#6366F1' },
        ...members.map(m => ({ id: m.id, label: m.name, color: m.color })),
        { id: 'shared', label: '공동', color: '#94A3B8' },
      ];
      filterEl.innerHTML = pills.map(p => {
        const active = state.fixedMember === p.id;
        return `<button onclick="switchFixedMember('${p.id}')"
          style="font-size:.75rem;font-weight:${active ? 700 : 600};padding:.3rem .75rem;border-radius:9999px;border:${active ? 'none' : '1px solid var(--border)'};background:${active ? p.color : 'var(--bg-inset)'};color:${active ? '#fff' : 'var(--t3)'};cursor:pointer;transition:all .15s;flex-shrink:0">
          ${p.label}
        </button>`;
      }).join('');
    }
  }

  // ── 추가폼 멤버 셀렉트 ──
  const memRow = document.getElementById('fixedMemberSelRow');
  const memSel = document.getElementById('fixedMemberSel');
  if (memRow) memRow.style.display = hasMem ? '' : 'none';
  if (memSel && hasMem) {
    const cur = memSel.value;
    memSel.innerHTML = `<option value="">공동</option>` +
      members.map(m => `<option value="${m.id}"${m.id === cur ? ' selected' : ''}>${m.name}</option>`).join('');
  }

  // ── 카테고리 셀렉트 ──
  const sel = document.getElementById('fixedCategory');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = Object.keys(allCats).map(c =>
      `<option value="${c}"${c === (cur || '고정지출') ? ' selected' : ''}>${c}</option>`
    ).join('');
  }

  // ── 멤버 필터 적용 ──
  let list = allList;
  if (hasMem && state.fixedMember !== 'all') {
    list = state.fixedMember === 'shared'
      ? allList.filter(i => !i.member)
      : allList.filter(i => i.member === state.fixedMember);
  }

  const total = list.reduce((s, i) => s + i.amount, 0);

  // ── 히어로 총액 ──
  const totalEl = document.getElementById('fixedTotalAmt');
  if (totalEl) totalEl.textContent = fmtAmt(total);
  const countEl = document.getElementById('fixedCount');
  if (countEl) countEl.textContent = `${list.length}건`;

  // ── 멤버별 합계 (전체 보기일 때만) ──
  const memberBdEl = document.getElementById('fixedMemberBreakdown');
  if (memberBdEl) {
    if (hasMem && state.fixedMember === 'all' && allList.length > 0) {
      const memTotals = {};
      members.forEach(m => { memTotals[m.id] = 0; });
      let sharedTotal = 0;
      for (const item of allList) {
        if (item.member && memTotals[item.member] !== undefined) memTotals[item.member] += item.amount;
        else sharedTotal += item.amount;
      }
      const rows = [
        ...members.map(m => ({ label: m.name, color: m.color, amt: memTotals[m.id] })),
        { label: '공동', color: '#94A3B8', amt: sharedTotal },
      ].filter(r => r.amt > 0);
      memberBdEl.innerHTML = rows.length > 0 ? `
        <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:.75rem;padding-top:.125rem">
          ${rows.map(r => `
            <div style="display:flex;align-items:center;gap:.375rem">
              <span style="width:.375rem;height:.375rem;border-radius:50%;background:${r.color};flex-shrink:0"></span>
              <span style="font-size:.6875rem;color:var(--t3)">${r.label}</span>
              <span class="num" style="font-size:.6875rem;font-weight:700;color:var(--t2)">${fmtAmt(r.amt)}</span>
            </div>`).join('')}
        </div>` : '';
    } else {
      memberBdEl.innerHTML = '';
    }
  }

  // ── 카테고리 비중 바 ──
  const bdEl = document.getElementById('fixedBreakdown');
  if (bdEl) {
    if (list.length === 0) {
      bdEl.innerHTML = `<p style="font-size:.75rem;color:var(--t5);text-align:center;padding:.5rem 0">
        ${hasMem && state.fixedMember !== 'all' ? '이 멤버의 항목이 없습니다' : '항목을 추가하면 비중이 표시됩니다'}</p>`;
    } else {
      const byCat = {};
      for (const item of list) byCat[item.category] = (byCat[item.category] || 0) + item.amount;
      const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      bdEl.innerHTML = sorted.map(([cat, amt]) => {
        const pct  = Math.round(amt / total * 100);
        const info = allCats[cat] || { color:'#94A3B8' };
        return `
          <div style="margin-bottom:.625rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.25rem">
              <div style="display:flex;align-items:center;gap:.375rem">
                <span style="width:.375rem;height:.375rem;border-radius:50%;background:${info.color};flex-shrink:0"></span>
                <span style="font-size:.75rem;color:var(--t2);font-weight:600">${cat}</span>
              </div>
              <div style="display:flex;align-items:center;gap:.75rem">
                <span class="num" style="font-size:.75rem;font-weight:700;color:var(--t2)">${fmtAmt(amt)}</span>
                <span class="num" style="font-size:.6875rem;color:var(--t4);min-width:2rem;text-align:right">${pct}%</span>
              </div>
            </div>
            <div style="background:var(--bg-inset);border-radius:9999px;height:5px;overflow:hidden">
              <div style="background:${info.color};height:100%;border-radius:9999px;width:${pct}%"></div>
            </div>
          </div>`;
      }).join('');
    }
  }

  // ── 항목 목록 — 카테고리별 아코디언 ──
  const container = document.getElementById('fixedList');
  if (!container) { refreshIcons(); return; }

  if (list.length === 0) {
    container.innerHTML = `<p style="font-size:.8125rem;color:var(--t5);text-align:center;padding:.75rem 0">
      ${hasMem && state.fixedMember !== 'all' ? '이 멤버의 항목이 없습니다' : '아직 등록된 항목이 없습니다'}</p>`;
    refreshIcons();
    return;
  }

  const grouped = {};
  for (const item of list) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  container.innerHTML = Object.entries(grouped).map(([cat, items]) => {
    const info      = allCats[cat] || { color:'#94A3B8' };
    const catTotal  = items.reduce((s, i) => s + i.amount, 0);
    const collapsed = fixedGroupState[cat] || false;

    const itemsHtml = items.map(item => {
      const pct = total > 0 ? Math.round(item.amount / total * 100) : 0;
      const mem = members.find(m => m.id === item.member);
      const memBadge = !hasMem ? '' : mem
        ? `<span style="font-size:.5625rem;font-weight:700;color:${mem.color};background:${mem.color}22;padding:.125rem .4rem;border-radius:9999px;flex-shrink:0;white-space:nowrap">${mem.name}</span>`
        : `<span style="font-size:.5625rem;font-weight:600;color:var(--t5);background:var(--bg-inset);padding:.125rem .4rem;border-radius:9999px;flex-shrink:0">공동</span>`;
      return `
        <div id="fixedRow-${item.id}" class="divider-row" style="display:flex;align-items:center;gap:.5rem;padding:.5rem .875rem">
          <div style="flex:1;min-width:0;display:flex;align-items:center;gap:.4rem;overflow:hidden">
            <span style="font-size:.875rem;font-weight:700;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name}</span>
            ${memBadge}
          </div>
          <span class="num" style="font-size:.875rem;font-weight:800;color:var(--t1);flex-shrink:0">${fmtAmt(item.amount)}</span>
          <span class="num" style="font-size:.625rem;color:var(--t5);min-width:1.75rem;text-align:right">${pct}%</span>
          <button onclick="editFixed('${item.id}')" title="수정"
            style="color:var(--t5);background:none;border:none;cursor:pointer;padding:.25rem;border-radius:.375rem;flex-shrink:0;display:flex;align-items:center;transition:color .15s"
            onmouseover="this.style.color='var(--t1)'" onmouseout="this.style.color='var(--t5)'">
            <i data-lucide="pencil" style="width:13px;height:13px"></i>
          </button>
          <button onclick="removeFixed('${item.id}')" title="삭제"
            style="color:var(--t5);background:none;border:none;cursor:pointer;padding:.25rem;border-radius:.375rem;flex-shrink:0;display:flex;align-items:center;transition:color .15s"
            onmouseover="this.style.color='#EF4444'" onmouseout="this.style.color='var(--t5)'">
            <i data-lucide="trash-2" style="width:13px;height:13px"></i>
          </button>
        </div>`;
    }).join('');

    return `
      <div style="border:1px solid var(--border);border-radius:.75rem;overflow:hidden;margin-bottom:.5rem">
        <button onclick="toggleFixedGroup('${cat.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"
          style="width:100%;display:flex;align-items:center;gap:.625rem;padding:.625rem .875rem;background:var(--bg-inset);border:none;cursor:pointer;text-align:left;transition:background .15s"
          onmouseover="this.style.background='var(--bg-raised)'" onmouseout="this.style.background='var(--bg-inset)'">
          <span style="width:.5rem;height:.5rem;border-radius:50%;background:${info.color};flex-shrink:0"></span>
          <span style="flex:1;font-size:.875rem;font-weight:700;color:var(--t1)">${cat}</span>
          <span class="num" style="font-size:.8125rem;font-weight:800;color:var(--t2)">${fmtAmt(catTotal)}</span>
          <span style="font-size:.6875rem;color:var(--t4);margin-left:.25rem">${items.length}건</span>
          <i data-lucide="${collapsed ? 'chevron-right' : 'chevron-down'}" style="width:14px;height:14px;color:var(--t4);flex-shrink:0;margin-left:.25rem"></i>
        </button>
        <div style="${collapsed ? 'display:none;' : ''}padding:.25rem 0">
          ${itemsHtml}
        </div>
      </div>`;
  }).join('');

  refreshIcons();
}

window.toggleFixedGroup = (cat) => {
  fixedGroupState[cat] = !fixedGroupState[cat];
  renderFixed();
};

window.switchFixedMember = (id) => {
  state.fixedMember = id;
  renderFixed();
};

window.addFixed = () => {
  const name   = document.getElementById('fixedName').value.trim();
  const amtRaw = document.getElementById('fixedAmount').value.trim();
  const cat    = document.getElementById('fixedCategory').value;
  const memSel = document.getElementById('fixedMemberSel');
  const member = memSel ? (memSel.value || null) : null;
  if (!name) { showToast('항목명을 입력해주세요.'); return; }
  const amount = parseInt(amtRaw.replace(/[^0-9]/g, ''));
  if (!amount || amount <= 0) { showToast('금액을 올바르게 입력해주세요.'); return; }
  const list = getFixed();
  list.push({ id: genId(), name, amount, category: cat, member });
  saveFixed(list);
  document.getElementById('fixedName').value   = '';
  document.getElementById('fixedAmount').value = '';
  renderFixed();
  showToast(`${name} 추가됨 ✓`);
};

window.removeFixed = (id) => {
  const item = getFixed().find(i => i.id === id);
  showConfirm(
    `${item?.name || '항목'} 삭제`,
    '이 고정지출 항목을 삭제하시겠습니까?',
    () => { saveFixed(getFixed().filter(i => i.id !== id)); renderFixed(); },
    '삭제', '#EF4444'
  );
};

window.editFixed = (id) => {
  const item = getFixed().find(i => i.id === id);
  if (!item) return;
  const row = document.getElementById(`fixedRow-${id}`);
  if (!row) return;
  const members = getMembers();
  const memOpts = members.length > 0
    ? `<select id="feM-${id}" class="app-input" style="flex:1;max-width:7rem;padding:.45rem .625rem;font-size:.8125rem">
        <option value="">공동</option>
        ${members.map(m => `<option value="${m.id}"${m.id === item.member ? ' selected' : ''}>${m.name}</option>`).join('')}
       </select>` : '';
  row.style.alignItems = 'flex-start';
  row.style.paddingTop = '.5rem';
  row.style.paddingBottom = '.5rem';
  row.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:.5rem;width:100%">
      <div style="display:flex;gap:.5rem">
        <input id="feN-${id}" class="app-input" value="${item.name.replace(/"/g,'&quot;')}"
          style="flex:1;padding:.45rem .625rem;font-size:.8125rem" placeholder="항목명">
        <input id="feA-${id}" class="app-input" value="${item.amount}"
          style="width:7rem;padding:.45rem .625rem;font-size:.8125rem;text-align:right" placeholder="금액">
      </div>
      <div style="display:flex;gap:.375rem;align-items:center;flex-wrap:wrap">
        <select id="feC-${id}" class="app-input" style="flex:1;padding:.45rem .625rem;font-size:.8125rem">
          ${Object.keys(getAllCategories()).map(c => `<option value="${c}"${c === item.category ? ' selected' : ''}>${c}</option>`).join('')}
        </select>
        ${memOpts}
        <button onclick="saveFixedEdit('${id}')" class="btn-sm">저장</button>
        <button onclick="renderFixed()"
          style="font-size:.75rem;font-weight:600;color:var(--t3);background:none;border:none;cursor:pointer;padding:.45rem .5rem;border-radius:.625rem;transition:background .15s"
          onmouseover="this.style.background='var(--bg-raised)'" onmouseout="this.style.background='none'">취소</button>
      </div>
    </div>`;
  document.getElementById(`feN-${id}`)?.focus();
};

window.saveFixedEdit = (id) => {
  const name   = document.getElementById(`feN-${id}`)?.value.trim();
  const amtRaw = document.getElementById(`feA-${id}`)?.value.trim();
  const cat    = document.getElementById(`feC-${id}`)?.value;
  const memEl  = document.getElementById(`feM-${id}`);
  if (!name) { showToast('항목명을 입력해주세요.'); return; }
  const amount = parseInt(amtRaw.replace(/[^0-9]/g, ''));
  if (!amount || amount <= 0) { showToast('금액을 올바르게 입력해주세요.'); return; }
  saveFixed(getFixed().map(i => {
    if (i.id !== id) return i;
    const updated = { ...i, name, amount, category: cat };
    if (memEl) updated.member = memEl.value || null;
    return updated;
  }));
  renderFixed();
  showToast(`${name} 수정됨 ✓`);
};

/* ── 수입 설정 ── */
function renderIncome() {
  const incList  = getIncome();
  const fixList  = getFixed();
  const incTotal = incList.reduce((s, i) => s + i.amount, 0);
  const fixTotal = fixList.reduce((s, i) => s + i.amount, 0);

  const totalEl = document.getElementById('incomeTotalAmt');
  if (totalEl) totalEl.textContent = fmtAmt(incTotal);
  const countEl = document.getElementById('incomeCount');
  if (countEl) countEl.textContent = `${incList.length}건`;

  // 수입 vs 고정지출 비교 바
  const vsEl = document.getElementById('incomeVsFixed');
  if (vsEl) {
    if (incTotal === 0) {
      vsEl.innerHTML = `<p style="font-size:.75rem;color:var(--t5);text-align:center;padding:.5rem 0">수입을 추가하면 분석이 표시됩니다</p>`;
    } else {
      const fixPct = Math.min(Math.round(fixTotal / incTotal * 100), 100);
      const disposable = incTotal - fixTotal;
      const dColor = disposable >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
      vsEl.innerHTML = `
        <div style="margin-bottom:.5rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.25rem">
            <span style="font-size:.75rem;font-weight:600;color:var(--t2)">월 수입</span>
            <span class="num" style="font-size:.75rem;font-weight:700;color:var(--color-income)">${fmtAmt(incTotal)}</span>
          </div>
          <div style="background:var(--bg-inset);border-radius:9999px;height:6px">
            <div style="background:var(--color-income);height:100%;border-radius:9999px;width:100%"></div>
          </div>
        </div>
        ${fixTotal > 0 ? `
        <div style="margin-bottom:.875rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.25rem">
            <span style="font-size:.75rem;font-weight:600;color:var(--t2)">고정 지출</span>
            <div style="display:flex;align-items:center;gap:.5rem">
              <span class="num" style="font-size:.75rem;font-weight:700;color:var(--color-expense)">${fmtAmt(fixTotal)}</span>
              <span class="num" style="font-size:.625rem;color:var(--t4)">${fixPct}%</span>
            </div>
          </div>
          <div style="background:var(--bg-inset);border-radius:9999px;height:6px;overflow:hidden">
            <div style="background:var(--color-expense);height:100%;border-radius:9999px;width:${fixPct}%"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:.625rem .875rem;background:var(--bg-inset);border-radius:.75rem">
          <span style="font-size:.75rem;font-weight:700;color:var(--t2)">여유 자금 예상</span>
          <span class="num" style="font-size:.9375rem;font-weight:800;color:${dColor}">${disposable >= 0 ? '' : '−'}${fmtAmt(Math.abs(disposable))}</span>
        </div>` : ''}`;
    }
  }

  // 수입 항목 목록
  const container = document.getElementById('incomeList');
  if (container) {
    if (incList.length === 0) {
      container.innerHTML = `<p style="font-size:.8125rem;color:var(--t5);text-align:center;padding:.75rem 0">아직 등록된 수입이 없습니다</p>`;
    } else {
      container.innerHTML = incList.map(item => `
        <div id="incomeRow-${item.id}" class="divider-row" style="display:flex;align-items:center;gap:.625rem">
          <span style="width:.375rem;height:.375rem;border-radius:50%;background:var(--color-income);flex-shrink:0"></span>
          <div style="flex:1;min-width:0">
            <div style="font-size:.875rem;font-weight:700;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name}</div>
            ${item.day ? `<div style="font-size:.6875rem;color:var(--t4)">매월 ${item.day}일 입금</div>` : '<div style="font-size:.6875rem;color:var(--t5)">입금일 미설정</div>'}
          </div>
          <span class="num" style="font-size:.875rem;font-weight:800;color:var(--color-income);flex-shrink:0">+${fmtAmt(item.amount)}</span>
          <button onclick="editIncome('${item.id}')" title="수정"
            style="color:var(--t5);background:none;border:none;cursor:pointer;padding:.25rem;border-radius:.375rem;flex-shrink:0;display:flex;align-items:center;transition:color .15s"
            onmouseover="this.style.color='var(--t1)'" onmouseout="this.style.color='var(--t5)'">
            <i data-lucide="pencil" style="width:13px;height:13px"></i>
          </button>
          <button onclick="removeIncome('${item.id}')" title="삭제"
            style="color:var(--t5);background:none;border:none;cursor:pointer;padding:.25rem;border-radius:.375rem;flex-shrink:0;display:flex;align-items:center;transition:color .15s"
            onmouseover="this.style.color='#EF4444'" onmouseout="this.style.color='var(--t5)'">
            <i data-lucide="trash-2" style="width:13px;height:13px"></i>
          </button>
        </div>
      `).join('');
    }
  }

  refreshIcons();
}

window.addIncome = () => {
  const name   = document.getElementById('incomeName').value.trim();
  const amtRaw = document.getElementById('incomeAmount').value.trim();
  const dayRaw = document.getElementById('incomeDay').value.trim();
  if (!name) { showToast('항목명을 입력해주세요.'); return; }
  const amount = parseInt(amtRaw.replace(/[^0-9]/g, ''));
  if (!amount || amount <= 0) { showToast('금액을 올바르게 입력해주세요.'); return; }
  const day = dayRaw ? Math.min(31, Math.max(1, parseInt(dayRaw))) : null;
  const list = getIncome();
  list.push({ id: genId(), name, amount, day });
  saveIncome(list);
  document.getElementById('incomeName').value   = '';
  document.getElementById('incomeAmount').value = '';
  document.getElementById('incomeDay').value    = '';
  renderIncome();
  showToast(`${name} 추가됨 ✓`);
};

window.removeIncome = (id) => {
  const item = getIncome().find(i => i.id === id);
  showConfirm(
    `${item?.name || '항목'} 삭제`,
    '이 수입 항목을 삭제하시겠습니까?',
    () => { saveIncome(getIncome().filter(i => i.id !== id)); renderIncome(); },
    '삭제', '#EF4444'
  );
};

window.editIncome = (id) => {
  const item = getIncome().find(i => i.id === id);
  if (!item) return;
  const row = document.getElementById(`incomeRow-${id}`);
  if (!row) return;
  row.style.alignItems = 'flex-start';
  row.style.paddingTop = '.5rem';
  row.style.paddingBottom = '.5rem';
  row.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:.5rem;width:100%">
      <div style="display:flex;gap:.5rem">
        <input id="ieN-${id}" class="app-input" value="${item.name.replace(/"/g,'&quot;')}"
          style="flex:1;padding:.45rem .625rem;font-size:.8125rem" placeholder="항목명">
        <input id="ieA-${id}" class="app-input" value="${item.amount}"
          style="width:7rem;padding:.45rem .625rem;font-size:.8125rem;text-align:right" placeholder="금액">
      </div>
      <div style="display:flex;gap:.375rem;align-items:center">
        <input id="ieD-${id}" class="app-input" type="number" min="1" max="31"
          value="${item.day || ''}" placeholder="입금일 (선택)"
          style="flex:1;padding:.45rem .625rem;font-size:.8125rem">
        <button onclick="saveIncomeEdit('${id}')" class="btn-sm">저장</button>
        <button onclick="renderIncome()"
          style="font-size:.75rem;font-weight:600;color:var(--t3);background:none;border:none;cursor:pointer;padding:.45rem .5rem;border-radius:.625rem;transition:background .15s"
          onmouseover="this.style.background='var(--bg-raised)'" onmouseout="this.style.background='none'">취소</button>
      </div>
    </div>`;
  document.getElementById(`ieN-${id}`)?.focus();
};

window.saveIncomeEdit = (id) => {
  const name   = document.getElementById(`ieN-${id}`)?.value.trim();
  const amtRaw = document.getElementById(`ieA-${id}`)?.value.trim();
  const dayRaw = document.getElementById(`ieD-${id}`)?.value.trim();
  if (!name) { showToast('항목명을 입력해주세요.'); return; }
  const amount = parseInt(amtRaw.replace(/[^0-9]/g, ''));
  if (!amount || amount <= 0) { showToast('금액을 올바르게 입력해주세요.'); return; }
  const day = dayRaw ? parseInt(dayRaw) : null;
  saveIncome(getIncome().map(i => i.id === id ? { ...i, name, amount, day } : i));
  renderIncome();
  showToast(`${name} 수정됨 ✓`);
};

/* ── 예정 지출 ── */
function renderPlanned() {
  const items = getPlanned();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dday = (dateStr) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  };

  // 현재 월 남은 예정 금액 (오늘 포함 미래)
  const [curY, curM] = state.ym.split('-').map(Number);
  const upcoming = items.filter(item => {
    const d = new Date(item.date);
    return d.getFullYear() === curY && d.getMonth() + 1 === curM && dday(item.date) >= 0;
  });
  const upcomingTotal = upcoming.reduce((s, i) => s + i.amount, 0);

  const heroAmtEl = document.getElementById('planHeroAmt');
  if (heroAmtEl) heroAmtEl.textContent = fmtAmt(upcomingTotal);
  const heroSubEl = document.getElementById('planHeroSub');
  if (heroSubEl) {
    const cnt = upcoming.length;
    const todayCnt = upcoming.filter(i => dday(i.date) === 0).length;
    heroSubEl.textContent = cnt === 0
      ? '이번 달 남은 예정 지출 없음'
      : `이번 달 ${cnt}건${todayCnt > 0 ? ` · 오늘 ${todayCnt}건 예정` : ''}`;
  }

  // 정렬: 미래(가까운 순) → 오늘 → 과거(최근 순)
  const future = items.filter(i => dday(i.date) > 0).sort((a, b) => new Date(a.date) - new Date(b.date));
  const todayItems = items.filter(i => dday(i.date) === 0);
  const past   = items.filter(i => dday(i.date) < 0).sort((a, b) => new Date(b.date) - new Date(a.date));
  const sorted = [...future, ...todayItems, ...past];

  const countEl = document.getElementById('planCount');
  if (countEl) countEl.textContent = `${items.length}건`;

  // 카테고리 셀렉트
  const sel = document.getElementById('planCategory');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = Object.keys(getAllCategories()).map(c =>
      `<option value="${c}"${c === (cur || '경조사') ? ' selected' : ''}>${c}</option>`
    ).join('');
  }

  const container = document.getElementById('planList');
  if (!container) return;

  if (sorted.length === 0) {
    container.innerHTML = `<p style="font-size:.8125rem;color:var(--t5);text-align:center;padding:.75rem 0">아직 등록된 예정 지출이 없습니다</p>`;
    refreshIcons();
    return;
  }

  container.innerHTML = sorted.map(item => {
    const diff   = dday(item.date);
    const isPast = diff < 0;
    const isToday = diff === 0;
    const catInfo = getAllCategories()[item.category] || { color: '#94A3B8' };

    let ddayText, ddayBg, ddayFg;
    if (isToday) {
      ddayText = 'D-Day'; ddayBg = '#EF4444'; ddayFg = '#fff';
    } else if (isPast) {
      ddayText = `D+${Math.abs(diff)}`; ddayBg = 'var(--bg-raised)'; ddayFg = 'var(--t5)';
    } else if (diff <= 7) {
      ddayText = `D-${diff}`; ddayBg = '#FEF2F2'; ddayFg = '#EF4444';
    } else {
      ddayText = `D-${diff}`; ddayBg = 'var(--bg-inset)'; ddayFg = 'var(--t3)';
    }

    return `
    <div id="planRow-${item.id}" class="divider-row" style="display:flex;align-items:center;gap:.625rem${isPast ? ';opacity:.45' : ''}">
      <span style="font-size:.625rem;font-weight:700;padding:.25rem .5rem;border-radius:9999px;background:${ddayBg};color:${ddayFg};white-space:nowrap;flex-shrink:0;min-width:2.75rem;text-align:center">${ddayText}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:.875rem;font-weight:700;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name}</div>
        <div style="display:flex;align-items:center;gap:.375rem;margin-top:.125rem">
          <span style="font-size:.6875rem;font-weight:600;color:${catInfo.color}">${item.category}</span>
          <span style="font-size:.6875rem;color:var(--t5)">${item.date}</span>
        </div>
      </div>
      <span class="num" style="font-size:.875rem;font-weight:800;color:var(--color-expense);flex-shrink:0">${fmtAmt(item.amount)}</span>
      <button onclick="editPlanned('${item.id}')" title="수정"
        style="color:var(--t5);background:none;border:none;cursor:pointer;padding:.25rem;border-radius:.375rem;flex-shrink:0;display:flex;align-items:center;transition:color .15s"
        onmouseover="this.style.color='var(--t1)'" onmouseout="this.style.color='var(--t5)'">
        <i data-lucide="pencil" style="width:13px;height:13px"></i>
      </button>
      <button onclick="removePlanned('${item.id}')" title="삭제"
        style="color:var(--t5);background:none;border:none;cursor:pointer;padding:.25rem;border-radius:.375rem;flex-shrink:0;display:flex;align-items:center;transition:color .15s"
        onmouseover="this.style.color='#EF4444'" onmouseout="this.style.color='var(--t5)'">
        <i data-lucide="trash-2" style="width:13px;height:13px"></i>
      </button>
    </div>`;
  }).join('');

  refreshIcons();
}

/* ── 날짜 피커 ── */
const dpState = { inputId: null, displayId: null, year: 0, month: 0, selected: null };

window.openDatePicker = (inputId, displayId) => {
  const today = new Date();
  const hidden = document.getElementById(inputId);
  if (hidden && hidden.value) {
    const d = new Date(hidden.value);
    dpState.year = d.getFullYear(); dpState.month = d.getMonth() + 1;
    dpState.selected = hidden.value;
  } else {
    dpState.year = today.getFullYear(); dpState.month = today.getMonth() + 1;
    dpState.selected = null;
  }
  dpState.inputId = inputId; dpState.displayId = displayId;
  renderDatePickerGrid();
  document.getElementById('datePickerModal').classList.remove('hidden');
  refreshIcons();
};

window.closeDatePicker = () => document.getElementById('datePickerModal').classList.add('hidden');

function renderDatePickerGrid() {
  const { year, month, selected } = dpState;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;

  document.getElementById('datePickerLabel').textContent = `${year}년 ${month}월`;

  const firstDay    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  let html = '';
  for (let i = 0; i < firstDay; i++) html += `<div></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${year}-${pad(month)}-${pad(d)}`;
    const isSel    = dateStr === selected;
    const isToday  = dateStr === todayStr;
    const col      = (firstDay + d - 1) % 7;
    const isSun    = col === 0, isSat = col === 6;

    let fg = isSun ? '#EF4444' : isSat ? '#3B82F6' : 'var(--t1)';
    let bg = 'transparent', border = 'none', fw = '500';
    if (isSel)        { bg = 'var(--btn-bg)'; fg = 'var(--btn-fg)'; fw = '700'; }
    else if (isToday) { border = '1.5px solid var(--btn-bg)'; fg = 'var(--btn-bg)'; fw = '700'; }

    const hover = isSel ? '' : `onmouseover="this.style.background='var(--bg-inset)'" onmouseout="this.style.background='transparent'"`;
    html += `<div onclick="selectDatePickerDay('${dateStr}')" ${hover}
      style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;font-size:.75rem;font-weight:${fw};color:${fg};background:${bg};border:${border};transition:background .12s">${d}</div>`;
  }
  document.getElementById('datePickerGrid').innerHTML = html;
}

window.datePickerNav = (unit, dir) => {
  if (unit === 'year') { dpState.year += dir; }
  else {
    dpState.month += dir;
    if (dpState.month > 12) { dpState.year++;  dpState.month = 1; }
    if (dpState.month < 1)  { dpState.year--;  dpState.month = 12; }
  }
  renderDatePickerGrid();
};

window.selectDatePickerDay = (dateStr) => {
  dpState.selected = dateStr;
  const hidden = document.getElementById(dpState.inputId);
  if (hidden) hidden.value = dateStr;
  const display = document.getElementById(dpState.displayId);
  if (display) { display.textContent = fmtDateKR(dateStr); display.style.color = 'var(--t1)'; }
  window.closeDatePicker();
};

window.addPlanned = () => {
  const name   = document.getElementById('planName').value.trim();
  const amtRaw = document.getElementById('planAmount').value.trim();
  const date   = document.getElementById('planDate').value;
  const cat    = document.getElementById('planCategory').value;
  if (!name) { showToast('항목명을 입력해주세요.'); return; }
  if (!date) { showToast('날짜를 선택해주세요.'); return; }
  const amount = parseInt(amtRaw.replace(/[^0-9]/g, ''));
  if (!amount || amount <= 0) { showToast('금액을 올바르게 입력해주세요.'); return; }
  const list = getPlanned();
  list.push({ id: genId(), name, amount, date, category: cat });
  savePlanned(list);
  document.getElementById('planName').value   = '';
  document.getElementById('planAmount').value = '';
  document.getElementById('planDate').value   = '';
  const lbl = document.getElementById('planDateLabel');
  if (lbl) { lbl.textContent = '날짜 선택'; lbl.style.color = 'var(--t4)'; }
  renderPlanned();
  showToast(`${name} 추가됨 ✓`);
};

window.removePlanned = (id) => {
  const item = getPlanned().find(i => i.id === id);
  showConfirm(
    `${item?.name || '항목'} 삭제`,
    '이 예정 지출 항목을 삭제하시겠습니까?',
    () => { savePlanned(getPlanned().filter(i => i.id !== id)); renderPlanned(); },
    '삭제', '#EF4444'
  );
};

window.editPlanned = (id) => {
  const item = getPlanned().find(i => i.id === id);
  if (!item) return;
  const row = document.getElementById(`planRow-${id}`);
  if (!row) return;
  row.style.alignItems = 'flex-start';
  row.style.paddingTop = '.5rem';
  row.style.paddingBottom = '.5rem';
  row.style.opacity = '1';
  const catOpts = Object.keys(getAllCategories()).map(c =>
    `<option value="${c}"${c === item.category ? ' selected' : ''}>${c}</option>`
  ).join('');
  row.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:.5rem;width:100%">
      <div style="display:flex;gap:.5rem">
        <input id="ppN-${id}" class="app-input" value="${item.name.replace(/"/g,'&quot;')}"
          style="flex:1;padding:.45rem .625rem;font-size:.8125rem" placeholder="항목명">
        <input id="ppA-${id}" class="app-input" value="${item.amount}"
          style="width:7rem;padding:.45rem .625rem;font-size:.8125rem;text-align:right" placeholder="금액">
      </div>
      <div style="display:flex;gap:.375rem;align-items:center;flex-wrap:wrap">
        <input id="ppD-${id}" type="hidden" value="${item.date}">
        <button type="button" onclick="openDatePicker('ppD-${id}','ppDLabel-${id}')" class="app-input"
          style="flex:1;min-width:120px;display:flex;align-items:center;gap:.375rem;cursor:pointer;padding:.45rem .625rem">
          <i data-lucide="calendar" style="width:13px;height:13px;color:var(--t4);flex-shrink:0"></i>
          <span id="ppDLabel-${id}" style="color:var(--t1);font-size:.8125rem">${fmtDateKR(item.date)}</span>
        </button>
        <select id="ppC-${id}" class="app-input" style="flex:1;min-width:80px;padding:.45rem .625rem;font-size:.8125rem">${catOpts}</select>
        <button onclick="savePlannedEdit('${id}')" class="btn-sm">저장</button>
        <button onclick="renderPlanned()"
          style="font-size:.75rem;font-weight:600;color:var(--t3);background:none;border:none;cursor:pointer;padding:.45rem .5rem;border-radius:.625rem;transition:background .15s"
          onmouseover="this.style.background='var(--bg-raised)'" onmouseout="this.style.background='none'">취소</button>
      </div>
    </div>`;
  document.getElementById(`ppN-${id}`)?.focus();
};

window.savePlannedEdit = (id) => {
  const name   = document.getElementById(`ppN-${id}`)?.value.trim();
  const amtRaw = document.getElementById(`ppA-${id}`)?.value.trim();
  const date   = document.getElementById(`ppD-${id}`)?.value;
  const cat    = document.getElementById(`ppC-${id}`)?.value;
  if (!name) { showToast('항목명을 입력해주세요.'); return; }
  if (!date) { showToast('날짜를 선택해주세요.'); return; }
  const amount = parseInt(amtRaw.replace(/[^0-9]/g, ''));
  if (!amount || amount <= 0) { showToast('금액을 올바르게 입력해주세요.'); return; }
  savePlanned(getPlanned().map(i => i.id === id ? { ...i, name, amount, date, category: cat } : i));
  renderPlanned();
  showToast(`${name} 수정됨 ✓`);
};

/* ── 캘린더 뷰 ── */
function switchRightTab(tab) {
  state.rightTab = tab;
  document.getElementById('rightPanel-list').classList.toggle('hidden', tab !== 'list');
  document.getElementById('rightPanel-calendar').classList.toggle('hidden', tab !== 'calendar');
  document.getElementById('rightTabBtn-list').classList.toggle('active', tab === 'list');
  document.getElementById('rightTabBtn-calendar').classList.toggle('active', tab === 'calendar');

  const all = JSON.parse(localStorage.getItem(SK.TX) || '{}');
  const txs = all[state.ym] || [];
  const active = txs.filter(t => !t.isCancelled);

  const clearBtn = document.getElementById('clearMonthBtn');
  if (clearBtn) clearBtn.classList.toggle('hidden', txs.length === 0);

  if (tab === 'calendar') {
    const listCountEl = document.getElementById('listCount');
    if (listCountEl) listCountEl.textContent = `${active.length}건`;
    renderCalendar(txs);
  } else {
    renderDetailTabs();
    renderTxList(txs);
  }
  refreshIcons();
}

function shortFmt(amt) {
  if (amt >= 10000) {
    const v = amt / 10000;
    return (v % 1 === 0 ? v : parseFloat(v.toFixed(1))) + '만';
  }
  if (amt >= 1000) return Math.round(amt / 1000) + '천';
  return String(amt);
}

function renderCalendar(txs) {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  const active = (txs || []).filter(t => !t.isCancelled);
  const [year, month] = state.ym.split('-').map(Number);
  const firstDay    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // 날짜별 지출 합계 + 내역 목록
  const dayTotals = {};
  const dayTxMap  = {};
  for (const tx of active) {
    const d = parseInt(tx.date.split('-')[2]);
    if (isNaN(d)) continue;
    dayTotals[d] = (dayTotals[d] || 0) + tx.amount;
    if (!dayTxMap[d]) dayTxMap[d] = [];
    dayTxMap[d].push(tx);
  }
  const maxAmt = Math.max(...Object.values(dayTotals), 1);

  const isDark = document.documentElement.classList.contains('dark');
  const today  = new Date();
  const isThisMonth = `${today.getFullYear()}-${pad(today.getMonth()+1)}` === state.ym;
  const todayD = today.getDate();

  const WDAYS = ['일','월','화','수','목','금','토'];

  // 요일 헤더
  let html = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:.375rem">`;
  WDAYS.forEach((w, i) => {
    const c = i===0 ? '#EF4444' : i===6 ? '#3B82F6' : 'var(--t4)';
    html += `<div style="text-align:center;padding:.15rem 0;font-size:.5625rem;font-weight:700;color:${c}">${w}</div>`;
  });
  html += '</div>';

  // 날짜 셀 그리드
  html += `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">`;
  for (let i = 0; i < firstDay; i++) html += '<div></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const amt   = dayTotals[d] || 0;
    const ratio = amt > 0 ? amt / maxAmt : 0;
    const isToday = isThisMonth && d === todayD;
    const isSel   = state.calDay === d;
    const hasTx   = amt > 0;

    let bg, numCol, amtCol;
    if (!hasTx) {
      bg = 'var(--bg-inset)'; numCol = 'var(--t5)'; amtCol = 'var(--t5)';
    } else if (ratio < 0.35) {
      bg = isDark ? 'rgba(99,102,241,.18)' : '#EEF2FF';
      numCol = isDark ? '#A5B4FC' : '#4338CA';
      amtCol = isDark ? '#818CF8' : '#4338CA';
    } else if (ratio < 0.7) {
      bg = isDark ? 'rgba(99,102,241,.4)' : '#C7D2FE';
      numCol = isDark ? '#E0E7FF' : '#3730A3';
      amtCol = isDark ? '#A5B4FC' : '#3730A3';
    } else {
      bg = isDark ? '#4338CA' : '#4F46E5';
      numCol = '#FFFFFF';
      amtCol = '#C7D2FE';
    }

    const todayRing = isToday ? 'outline:2px solid #6366F1;outline-offset:-2px;' : '';
    const selRing   = isSel   ? 'outline:2px solid #F59E0B;outline-offset:-2px;' : '';

    html += `
      <div onclick="selectCalDay(${d})"
           style="background:${bg};border-radius:6px;padding:3px 4px;min-height:46px;cursor:pointer;${todayRing}${selRing}transition:filter .1s"
           onmouseover="this.style.filter='brightness(.92)'" onmouseout="this.style.filter=''">
        <div style="font-size:.625rem;font-weight:${isToday?'800':'600'};color:${numCol}">${d}</div>
        ${hasTx ? `<div class="num" style="font-size:.5625rem;font-weight:700;color:${amtCol};margin-top:2px;line-height:1.3">${shortFmt(amt)}</div>` : ''}
      </div>`;
  }
  html += '</div>';

  // 선택된 날짜 상세
  if (state.calDay) {
    const dateStr = `${state.ym}-${pad(state.calDay)}`;
    const dayTxs  = (dayTxMap[state.calDay] || []).sort((a,b) => a.merchant.localeCompare(b.merchant));
    const dayTotal = dayTxs.reduce((s,t) => s + t.amount, 0);
    html += `
      <div style="border-top:1px solid var(--divider);padding-top:.75rem;margin-top:.625rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
          <span style="font-size:.8125rem;font-weight:700;color:var(--t2)">${month}월 ${state.calDay}일</span>
          <span class="num" style="font-size:.8125rem;font-weight:800;color:var(--t1)">${fmtAmt(dayTotal)}</span>
        </div>
        ${dayTxs.length === 0
          ? `<p style="font-size:.75rem;color:var(--t5);text-align:center;padding:.75rem 0">내역 없음</p>`
          : dayTxs.map(tx => `
              <div class="divider-row" style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <div style="font-size:.8125rem;font-weight:600;color:var(--t2)">${tx.merchant}</div>
                  <div style="font-size:.625rem;font-weight:600;color:${CATEGORIES[tx.category]?.color||'var(--t4)'}">${tx.category}</div>
                </div>
                <div class="num" style="font-size:.8125rem;font-weight:700;color:var(--t1)">${fmtAmt(tx.amount)}</div>
              </div>`).join('')
        }
      </div>`;
  }

  grid.innerHTML = html;
}

/* ── 멤버 관리 ── */
function renderMemberPills(allTxs) {
  const members = getMembers();
  const row = document.getElementById('memberFilterRow');
  if (!row) return;
  if (members.length === 0) { row.classList.add('hidden'); return; }
  row.classList.remove('hidden');

  const pillsEl = document.getElementById('memberPills');
  if (!pillsEl) return;

  const active = (allTxs || []).filter(t => !t.isCancelled);
  const isAll  = state.activeMember === 'all';
  pillsEl.innerHTML = [
    `<button class="member-pill${isAll ? ' member-pill-on' : ''}" onclick="switchMember('all')">전체 합산</button>`,
    ...members.map(m => {
      const amt  = active.filter(t => t.memberId === m.id).reduce((s,t) => s+t.amount, 0);
      const isOn = state.activeMember === m.id;
      return `<button class="member-pill${isOn ? ' member-pill-on' : ''}"
        style="${isOn ? `background:${m.color};border-color:${m.color}` : ''}"
        onclick="switchMember('${m.id}')">
        <span style="width:.4rem;height:.4rem;border-radius:50%;background:${isOn ? 'rgba(255,255,255,.8)' : m.color};display:inline-block;flex-shrink:0"></span>
        ${m.name}${amt > 0 ? `<span style="opacity:.75;font-weight:500"> ${shortFmt(amt)}</span>` : ''}
      </button>`;
    }),
  ].join('');
  refreshIcons();
}

function renderMemberBreakdown(allTxs) {
  const members = getMembers();
  const card      = document.getElementById('memberBreakdownCard');
  const container = document.getElementById('memberBreakdown');
  if (!card || !container) return;
  if (members.length === 0) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');

  const active     = (allTxs || []).filter(t => !t.isCancelled);
  const grandTotal = active.reduce((s,t) => s+t.amount, 0);

  if (grandTotal === 0) {
    container.innerHTML = `<p style="font-size:.75rem;color:var(--t5);text-align:center;padding:.5rem 0">이번 달 내역 없음</p>`;
    return;
  }

  container.innerHTML = members.map(m => {
    const mTxs   = active.filter(t => t.memberId === m.id);
    const mTotal = mTxs.reduce((s,t) => s+t.amount, 0);
    const pct    = Math.round(mTotal / grandTotal * 100);
    return `
      <div style="margin-bottom:.625rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.25rem">
          <div style="display:flex;align-items:center;gap:.375rem">
            <span style="width:.4rem;height:.4rem;border-radius:50%;background:${m.color};flex-shrink:0"></span>
            <span style="font-size:.75rem;font-weight:700;color:var(--t2)">${m.name}</span>
            <span style="font-size:.625rem;color:var(--t4)">${mTxs.length}건</span>
          </div>
          <div style="display:flex;align-items:center;gap:.5rem">
            <span class="num" style="font-size:.75rem;font-weight:700;color:var(--t2)">${fmtAmt(mTotal)}</span>
            <span class="num" style="font-size:.625rem;color:var(--t4)">${pct}%</span>
          </div>
        </div>
        <div style="background:var(--bg-inset);border-radius:9999px;height:5px;overflow:hidden">
          <div style="background:${m.color};height:100%;border-radius:9999px;width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

function renderInputMemberSelector() {
  const members = getMembers();
  const row  = document.getElementById('inputMemberRow');
  const pils = document.getElementById('inputMemberPills');
  if (!row || !pils) return;
  if (members.length === 0) { row.classList.add('hidden'); state.inputMember = null; return; }
  row.classList.remove('hidden');
  if (!state.inputMember || !members.find(m => m.id === state.inputMember)) {
    state.inputMember = members[0].id;
  }
  pils.innerHTML = members.map(m => {
    const isOn = state.inputMember === m.id;
    return `<button class="member-pill${isOn ? ' member-pill-on' : ''}"
      style="${isOn ? `background:${m.color};border-color:${m.color}` : ''}"
      onclick="selectInputMember('${m.id}')">
      <span style="width:.4rem;height:.4rem;border-radius:50%;background:${isOn ? 'rgba(255,255,255,.8)' : m.color};display:inline-block;flex-shrink:0"></span>
      ${m.name}
    </button>`;
  }).join('');
}

function renderMemberModalList() {
  const members   = getMembers();
  const container = document.getElementById('memberModalList');
  if (!container) return;
  if (members.length === 0) {
    container.innerHTML = `<p style="font-size:.8125rem;color:var(--t5);text-align:center;padding:.75rem 0">멤버가 없습니다.<br><span style="font-size:.6875rem">아래서 추가해보세요.</span></p>`;
    return;
  }
  container.innerHTML = members.map(m => `
    <div style="display:flex;align-items:center;gap:.75rem;padding:.625rem 0;border-bottom:1px solid var(--divider)">
      <span style="width:.75rem;height:.75rem;border-radius:50%;background:${m.color};flex-shrink:0"></span>
      <span style="flex:1;font-size:.875rem;font-weight:700;color:var(--t1)">${m.name}</span>
      <button onclick="removeMember('${m.id}')"
        style="color:var(--t5);background:none;border:none;cursor:pointer;font-size:.8125rem;padding:.2rem .5rem;border-radius:.375rem;transition:color .15s"
        onmouseover="this.style.color='#EF4444'" onmouseout="this.style.color='var(--t5)'">삭제</button>
    </div>`).join('');
}

window.switchMember = (id) => {
  state.activeMember = id;
  renderDashboard();
};
window.selectInputMember = (id) => {
  state.inputMember = id;
  renderInputMemberSelector();
};
window.openMemberModal = () => {
  renderMemberModalList();
  document.getElementById('memberModal').classList.remove('hidden');
};
window.closeMemberModal = () => document.getElementById('memberModal').classList.add('hidden');
window.addMember = () => {
  const name = document.getElementById('newMemberName').value.trim();
  if (!name) { showToast('이름을 입력해주세요.'); return; }
  const members = getMembers();
  if (members.find(m => m.name === name)) { showToast('이미 같은 이름의 멤버가 있습니다.'); return; }
  const color = MEMBER_COLORS[members.length % MEMBER_COLORS.length];
  members.push({ id: genId(), name, color });
  saveMembers(members);
  document.getElementById('newMemberName').value = '';
  renderMemberModalList();
  showToast(`${name} 추가됨 ✓`);
};
window.removeMember = (id) => {
  const m = getMembers().find(i => i.id === id);
  showConfirm(
    `${m?.name || '멤버'} 삭제`,
    '멤버를 삭제해도 해당 내역은 유지되며 "전체 합산"에서 확인할 수 있습니다.',
    () => {
      saveMembers(getMembers().filter(i => i.id !== id));
      if (state.activeMember === id) state.activeMember = 'all';
      if (state.inputMember  === id) state.inputMember  = null;
      renderMemberModalList();
      if (state.tab === 'dashboard') renderDashboard();
    },
    '삭제', '#EF4444'
  );
};

/* ── 클라우드 동기화 ── */
function getAllSyncData() {
  const d = {};
  SYNC_DATA_KEYS.forEach(k => { d[k] = localStorage.getItem(k) || (k === SK.TX || k === SK.KW ? '{}' : '[]'); });
  return d;
}

function applyRemoteData(data) {
  sync.applying = true;
  SYNC_DATA_KEYS.forEach(k => { if (data[k] !== undefined) localStorage.setItem(k, data[k]); });
  sync.applying = false;
  switchTab(state.tab);
}

async function fbGet(dbUrl, code) {
  try {
    const r = await fetch(`${dbUrl.replace(/\/$/, '')}/rooms/${code}.json`);
    if (!r.ok) return null;
    const d = await r.json();
    return (d && typeof d === 'object') ? d : null;
  } catch { return null; }
}

async function fbSet(dbUrl, code, data) {
  try {
    const r = await fetch(`${dbUrl.replace(/\/$/, '')}/rooms/${code}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return r.ok;
  } catch { return false; }
}

function triggerPush() {
  const code = getSyncCode();
  if (!code) return;
  clearTimeout(sync.pushTimer);
  sync.pushTimer = setTimeout(async () => {
    sync.lastPushTime = Date.now();
    await fbSet(FIREBASE_DB_URL, code, getAllSyncData());
  }, 800);
}

function startSyncPoll() {
  stopSyncPoll();
  if (!getSyncCode()) return;
  sync.pollTimer = setInterval(async () => {
    const code = getSyncCode();
    if (!code) return;
    if (Date.now() - sync.lastPushTime < 4000) return;
    const remote = await fbGet(FIREBASE_DB_URL, code);
    if (!remote) return;
    const local = getAllSyncData();
    if (SYNC_DATA_KEYS.some(k => remote[k] !== local[k])) applyRemoteData(remote);
  }, 5000);
}

function stopSyncPoll() {
  if (sync.pollTimer) { clearInterval(sync.pollTimer); sync.pollTimer = null; }
}

function updateSyncIndicator() {
  const code  = getSyncCode();
  const icon  = document.getElementById('syncIcon');
  const label = document.getElementById('syncLabel');
  const btn   = document.getElementById('syncBtn');
  if (code) {
    icon?.setAttribute('data-lucide', 'cloud-upload');
    if (label) { label.textContent = '동기화중'; label.style.color = '#10B981'; }
    if (btn)   btn.classList.add('on');
  } else {
    icon?.setAttribute('data-lucide', 'cloud');
    if (label) { label.textContent = '동기화'; label.style.color = ''; }
    if (btn)   btn.classList.remove('on');
  }
  refreshIcons();
}

function renderSyncModal() {
  const code = getSyncCode();
  const statusEl = document.getElementById('syncStatus');
  if (statusEl) {
    statusEl.innerHTML = code
      ? `<span style="font-weight:700;color:#10B981">● 동기화 중</span>
         <span style="font-weight:800;background:var(--bg-raised);padding:.2rem .625rem;border-radius:.375rem;font-family:monospace;letter-spacing:.12em">${code}</span>`
      : `<span style="color:var(--t4)">● 연결 안됨 — 아래서 코드를 생성하거나 입력하세요</span>`;
  }
  document.getElementById('syncConnected')?.classList.toggle('hidden', !code);
  document.getElementById('syncDisconnected')?.classList.toggle('hidden', !!code);
  if (code) {
    const codeEl = document.getElementById('syncCodeDisplay');
    if (codeEl) codeEl.textContent = code;
  }
}

window.openSyncModal  = () => { renderSyncModal(); document.getElementById('syncModal').classList.remove('hidden'); refreshIcons(); };
window.closeSyncModal = () => document.getElementById('syncModal').classList.add('hidden');

window.createSyncRoom = async () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code  = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  showToast('코드 생성 중…');
  const ok = await fbSet(FIREBASE_DB_URL, code, getAllSyncData());
  if (!ok) { showToast('서버 연결 실패. 잠시 후 다시 시도해주세요.'); return; }
  sync.lastPushTime = Date.now();
  saveSyncCode(code);
  startSyncPoll();
  renderSyncModal();
  updateSyncIndicator();
  showToast(`동기화 코드 생성됨: ${code}`);
};

window.joinWithCode = () => {
  const code = document.getElementById('syncCodeInput')?.value.trim().toUpperCase();
  if (!code || code.length < 4) { showToast('코드를 입력해주세요.'); return; }
  showConfirm(
    '코드로 연결',
    '현재 기기의 데이터가 클라우드 데이터로 교체됩니다. 계속하시겠습니까?',
    async () => {
      showToast('연결 중…');
      const remote = await fbGet(FIREBASE_DB_URL, code);
      if (!remote) { showToast('코드를 찾을 수 없습니다.'); return; }
      applyRemoteData(remote);
      saveSyncCode(code);
      startSyncPoll();
      window.closeSyncModal();
      updateSyncIndicator();
      showToast('동기화 연결됨 ✓');
    },
    '연결', 'var(--btn-bg)'
  );
};

window.confirmDisconnectSync = () => {
  showConfirm('동기화 해제', '동기화를 해제합니다. 현재 데이터는 유지됩니다.', () => {
    stopSyncPoll();
    saveSyncCode(null);
    renderSyncModal();
    updateSyncIndicator();
    showToast('동기화 해제됨');
  }, '해제', '#EF4444');
};

window.copySyncCode = () => {
  const code = getSyncCode();
  if (code) navigator.clipboard.writeText(code).then(() => showToast('코드 복사됨 ✓'));
};

/* ── 초기화 ── */
document.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem(SK.KW)) saveKwMap(DEFAULT_KEYWORD_MAP);
  if (localStorage.getItem(SK.DARK) === 'true') document.documentElement.classList.add('dark');
  if (localStorage.getItem(SK.LAYOUT) === 'pc') document.documentElement.classList.add('pc-mode');

  const pre = document.getElementById('sampleRawText');
  if (pre) pre.textContent = SAMPLE_RAW_TEXT;

  syncUI();
  switchTab('dashboard');

  // 동기화 복원
  const savedCode = getSyncCode();
  if (savedCode) {
    updateSyncIndicator();
    startSyncPoll();
    fbGet(FIREBASE_DB_URL, savedCode).then(data => {
      if (!data) return;
      sync.applying = true;
      SYNC_DATA_KEYS.forEach(k => { if (data[k] !== undefined) localStorage.setItem(k, data[k]); });
      sync.applying = false;
      switchTab(state.tab);
    });
  }
});

/* ── 전역 함수 등록 ── */
window.toggleDark      = toggleDark;
window.toggleLayout    = toggleLayout;
window.switchTab       = switchTab;
window.switchDetailTab = switchDetailTab;
window.switchRightTab  = switchRightTab;
window.selectCalDay    = (d) => {
  state.calDay = state.calDay === d ? null : d;
  const all = JSON.parse(localStorage.getItem(SK.TX) || '{}');
  renderCalendar(all[state.ym] || []);
};

window.handleFileSelect = (e) => { const f = e.target.files[0]; if (f) readFile(f); };
window.handleDragOver   = (e) => { e.preventDefault(); document.getElementById('uploadZone').classList.add('drag-over'); };
window.handleDragLeave  = ()  => document.getElementById('uploadZone').classList.remove('drag-over');
window.handleDrop = (e) => {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) readFile(f);
};
window.clearUpload = (e) => {
  e.stopPropagation();
  document.getElementById('uploadDefault').classList.remove('hidden');
  document.getElementById('uploadSuccess').classList.add('hidden');
  document.getElementById('statementInput').value = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('parsePreview').classList.add('hidden');
  state.pending = [];
};
window.parseStatement = () => {
  const raw = document.getElementById('statementInput').value.trim();
  if (!raw) return;
  state.pending = parseText(raw);
  if (state.pending.length === 0) {
    showToast('날짜·사용처·금액을 찾을 수 없습니다. 형식을 확인해주세요.');
    return;
  }
  renderPreview();
};
window.saveTransactions = () => {
  if (state.pending.length === 0) return;
  const all = JSON.parse(localStorage.getItem(SK.TX) || '{}');
  const txsToSave = state.inputMember
    ? state.pending.map(tx => ({ ...tx, memberId: state.inputMember }))
    : state.pending;
  all[state.ym] = [...(all[state.ym] || []), ...txsToSave];
  localStorage.setItem(SK.TX, JSON.stringify(all));
  showToast(`${state.pending.length}건 저장 완료 ✓`);
  state.pending = [];
  document.getElementById('statementInput').value  = '';
  document.getElementById('parsePreview').classList.add('hidden');
  document.getElementById('uploadDefault').classList.remove('hidden');
  document.getElementById('uploadSuccess').classList.add('hidden');
  document.getElementById('fileInput').value = '';
  window.switchTab('dashboard');
};
window.openCategoryModal = openCategoryModal;
window.selectCategory = (cat) => {
  state.pending[state.modalIdx].category = cat;
  if (document.getElementById('modalSaveKeyword').checked) {
    const map = getKwMap();
    map[state.pending[state.modalIdx].merchant] = cat;
    saveKwMap(map);
  }
  closeModal();
  renderPreview();
};
window.closeModal = closeModal;
window.addKeyword = () => {
  const kw  = document.getElementById('newKeyword').value.trim();
  const cat = document.getElementById('newCategory').value;
  if (!kw) return;
  const map = getKwMap();
  map[kw] = cat;
  saveKwMap(map);
  document.getElementById('newKeyword').value = '';
  renderKeywords();
};
window.removeKeyword = (kw) => {
  const map = getKwMap();
  delete map[kw];
  saveKwMap(map);
  renderKeywords();
};
window.confirmResetKeywords = () => {
  showConfirm('키워드 초기화', '모든 키워드를 기본값으로 초기화하시겠습니까?', () => {
    saveKwMap(DEFAULT_KEYWORD_MAP);
    renderKeywords();
  });
};
window.openKeywordsModal = () => {
  renderKeywords();
  document.getElementById('keywordsModal').classList.remove('hidden');
  refreshIcons();
};
window.closeKeywordsModal = () => document.getElementById('keywordsModal').classList.add('hidden');
window.closeConfirm = closeConfirm;
window.confirmClearMonth = () => {
  showConfirm(
    `${fmtYM(state.ym)} 삭제`,
    '해당 월의 모든 데이터를 삭제하시겠습니까?',
    () => { saveMth(state.ym, []); renderDashboard(); }
  );
};
window.changeMonth = (n) => {
  const [y, m] = state.ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  state.ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  state.calDay = null;
  renderDashboard();
};
window.openSampleModal = () => {
  const sampleParsed = parseText(SAMPLE_RAW_TEXT);
  const resultList   = document.getElementById('sampleResultList');
  if (resultList) {
    resultList.innerHTML = sampleParsed.map(tx => `
      <div class="divider-row" style="display:flex;justify-content:space-between;padding:8px 0">
        <div>
          <div style="font-weight:600;font-size:13px">${tx.merchant}</div>
          <div style="font-size:11px;font-weight:600;color:${CATEGORIES[tx.category]?.color || 'var(--t4)'}">${tx.category}</div>
          <div style="font-size:10px;color:var(--t5)">${tx.date}</div>
        </div>
        <div style="font-weight:700">${fmtAmt(tx.amount)}</div>
      </div>
    `).join('');
  }
  const demoBtn = document.getElementById('sampleDemoBtn');
  if (demoBtn) {
    const isLoaded = hasDemoData();
    demoBtn.textContent = isLoaded ? '샘플 데이터 제거' : '샘플 데이터 바로 저장';
    demoBtn.onclick = isLoaded
      ? () => { removeDemoData(); closeSampleModal(); }
      : () => { loadDemoData(); closeSampleModal(); };
  }
  document.getElementById('sampleModal').classList.remove('hidden');
};
window.closeSampleModal = () => document.getElementById('sampleModal').classList.add('hidden');
window.switchSampleTab  = (tab) => {
  document.getElementById('sampleTextTab').classList.toggle('hidden', tab !== 'text');
  document.getElementById('sampleResultTab').classList.toggle('hidden', tab !== 'result');
  document.querySelectorAll('.sample-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`sampleTab-${tab}`).classList.add('active');
};
window.copySampleText    = () => navigator.clipboard.writeText(SAMPLE_RAW_TEXT);
window.loadSampleToInput = () => {
  document.getElementById('statementInput').value = SAMPLE_RAW_TEXT;
  window.closeSampleModal();
};
function hasDemoData() {
  const all = JSON.parse(localStorage.getItem(SK.TX) || '{}');
  return Object.values(all).some(txs => txs.some(t => t._isDemo));
}

window.removeDemoData = () => {
  const all = JSON.parse(localStorage.getItem(SK.TX) || '{}');
  let changed = false;
  Object.keys(all).forEach(ym => {
    const filtered = all[ym].filter(t => !t._isDemo);
    if (filtered.length !== all[ym].length) { all[ym] = filtered; changed = true; }
  });
  if (changed) {
    localStorage.setItem(SK.TX, JSON.stringify(all));
    renderDashboard();
  }
};

window.loadDemoData = () => {
  const ym = state.ym;
  const demo = [
    { id:genId(), merchant:'스타벅스',   amount:5500,  category:'식비',      date:`${ym}-05`, isInstallment:false, isCancelled:false, _isDemo:true },
    { id:genId(), merchant:'배달의민족',  amount:24000, category:'식비',      date:`${ym}-08`, isInstallment:false, isCancelled:false, _isDemo:true },
    { id:genId(), merchant:'카카오 택시', amount:8900,  category:'교통',      date:`${ym}-10`, isInstallment:false, isCancelled:false, _isDemo:true },
    { id:genId(), merchant:'쿠팡',        amount:35000, category:'쇼핑/생활', date:`${ym}-12`, isInstallment:false, isCancelled:false, _isDemo:true },
    { id:genId(), merchant:'LGU+ 통신',   amount:55000, category:'고정지출',  date:`${ym}-15`, isInstallment:false, isCancelled:false, _isDemo:true },
    { id:genId(), merchant:'올리브영',    amount:22000, category:'쇼핑/생활', date:`${ym}-18`, isInstallment:false, isCancelled:false, _isDemo:true },
    { id:genId(), merchant:'컴포즈커피',  amount:3500,  category:'식비',      date:`${ym}-20`, isInstallment:false, isCancelled:false, _isDemo:true },
  ];
  const all = JSON.parse(localStorage.getItem(SK.TX) || '{}');
  all[ym] = [...(all[ym] || []).filter(t => !t._isDemo), ...demo];
  localStorage.setItem(SK.TX, JSON.stringify(all));
  renderDashboard();
};

/* ── 카테고리 관리 ── */
function renderCatModal() {
  const custom    = getCustomCats();
  const container = document.getElementById('catMgmtList');
  if (!container) return;

  const builtinHtml = Object.entries(CATEGORIES).map(([name, info]) => `
    <div style="display:flex;align-items:center;gap:.625rem;padding:.5rem 0;border-bottom:1px solid var(--divider)">
      <span style="width:.5rem;height:.5rem;border-radius:50%;background:${info.color};flex-shrink:0"></span>
      <span style="flex:1;font-size:.875rem;font-weight:600;color:var(--t2)">${name}</span>
      <span style="font-size:.625rem;color:var(--t5);padding:.2rem .5rem;background:var(--bg-inset);border-radius:.375rem">기본</span>
    </div>`).join('');

  const customEntries = Object.entries(custom);
  const customHtml = customEntries.length === 0 ? '' : customEntries.map(([name, info]) => `
    <div style="display:flex;align-items:center;gap:.625rem;padding:.5rem 0;border-bottom:1px solid var(--divider)">
      <span style="width:.5rem;height:.5rem;border-radius:50%;background:${info.color};flex-shrink:0"></span>
      <span style="flex:1;font-size:.875rem;font-weight:600;color:var(--t1)">${name}</span>
      <button onclick="removeCustomCat(${JSON.stringify(name)})"
        style="color:#F87171;background:none;border:none;cursor:pointer;padding:.25rem;border-radius:.375rem;display:flex;align-items:center;transition:color .15s"
        onmouseover="this.style.color='#EF4444'" onmouseout="this.style.color='#F87171'">
        <i data-lucide="trash-2" style="width:13px;height:13px"></i>
      </button>
    </div>`).join('');

  container.innerHTML = builtinHtml +
    (customEntries.length > 0 ? `<p style="font-size:.6875rem;font-weight:700;color:var(--t3);margin:.75rem 0 .25rem">사용자 정의</p>${customHtml}` : '');
  refreshIcons();
}

window.openCatModal = () => {
  renderCatModal();
  document.getElementById('catMgmtModal').classList.remove('hidden');
  refreshIcons();
};
window.closeCatModal = () => {
  document.getElementById('catMgmtModal').classList.add('hidden');
  renderFixed();
  renderPlanned();
};

window.addCustomCat = () => {
  const input = document.getElementById('newCatName');
  if (!input) return;
  const name = input.value.trim();
  if (!name) { showToast('카테고리 이름을 입력해주세요.'); return; }
  const allCats = getAllCategories();
  if (allCats[name]) { showToast('이미 존재하는 카테고리입니다.'); return; }
  const custom    = getCustomCats();
  const colorInfo = CUSTOM_CAT_COLORS[Object.keys(custom).length % CUSTOM_CAT_COLORS.length];
  custom[name]    = colorInfo;
  saveCustomCats(custom);
  input.value = '';
  renderCatModal();
  renderFixed();
  renderPlanned();
  showToast(`'${name}' 카테고리 추가됨 ✓`);
};

window.removeCustomCat = (name) => {
  showConfirm(
    `'${name}' 삭제`,
    '카테고리를 삭제해도 기존 항목은 유지됩니다.',
    () => {
      const custom = getCustomCats();
      delete custom[name];
      saveCustomCats(custom);
      renderCatModal();
      renderFixed();
      renderPlanned();
      showToast(`'${name}' 카테고리 삭제됨`);
    },
    '삭제', '#EF4444'
  );
};
