/**
 * 머니로그 — 시스템 로직
 */

const CATEGORIES = {
  '식비':         { color:'#EF4444', bg:'#FEF2F2', darkBg:'#3b0d0d', icon:'utensils'      },
  '교통':         { color:'#3B82F6', bg:'#EFF6FF', darkBg:'#0c1e3b', icon:'car'           },
  '쇼핑/생활':    { color:'#10B981', bg:'#ECFDF5', darkBg:'#062a1a', icon:'shopping-bag'  },
  '고정지출':     { color:'#8B5CF6', bg:'#F5F3FF', darkBg:'#1e1040', icon:'repeat'        },
  '기타':         { color:'#94A3B8', bg:'#F8FAFC', darkBg:'#141b2d', icon:'help-circle'   },
};

// 상세 내역 탭 그룹 — '전체'는 null(필터 없음), 나머지는 해당 카테고리 배열
const CAT_GROUPS_FOR_TABS = {
  '전체':      null,
  '식비':      ['식비'],
  '교통':      ['교통'],
  '쇼핑/생활': ['쇼핑/생활'],
  '고정지출':  ['고정지출'],
  '기타':      ['기타'],
};

const SK = { TX: 'vml_transactions', KW: 'vml_keyword_map', DARK: 'vml_dark', LAYOUT: 'vml_layout' };

const state = {
  ym: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  tab: 'dashboard',
  pending: [],
  modalIdx: null,
  chart: null,
  detailTab: '전체',
  rightTab: 'list',
  calDay: null,
};

/* ── 유틸리티 ── */
const fmtAmt = n => n.toLocaleString('ko-KR') + '원';
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

const categorize = (merchant) => {
  const map = getKwMap();
  for (const [kw, cat] of Object.entries(map)) {
    if (merchant.includes(kw)) return cat;
  }
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

/* ── Excel 행 직접 파싱 (헤더 자동 감지) ── */
function parseExcelRows(rows) {
  const headerIdx = rows.findIndex(row =>
    Array.isArray(row) &&
    row.some(c => /날짜|일자|이용일|승인일/.test(String(c))) &&
    row.some(c => /가맹점|상호|이용처|사용처|이용내역|적요/.test(String(c)))
  );
  if (headerIdx === -1) return null;

  const header = rows[headerIdx].map(c => String(c));
  const dateCol     = header.findIndex(c => /날짜|일자|이용일|승인일/.test(c));
  const merchantCol = header.findIndex(c => /가맹점|상호|이용처|사용처|이용내역|적요/.test(c));
  const amountCol   = header.findIndex(c => /이용금액|사용금액|출금금액|금액/.test(c));
  if (merchantCol === -1) return null;

  const results = [];
  for (const row of rows.slice(headerIdx + 1)) {
    if (!Array.isArray(row)) continue;
    const dateRaw     = String(row[dateCol]     ?? '').trim();
    const merchantRaw = String(row[merchantCol] ?? '').trim();
    const amountRaw   = String(row[amountCol]   ?? '').trim();
    if (!merchantRaw) continue;

    let date = '';
    const dm = dateRaw.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (dm) date = `${dm[1]}-${dm[2].padStart(2,'0')}-${dm[3].padStart(2,'0')}`;
    else if (dateRaw) date = state.ym + '-01';
    else continue;

    const amountNum = parseInt(amountRaw.replace(/[^0-9\-]/g, '') || '0');
    if (amountNum === 0) continue;

    results.push({
      id: genId(), date, merchant: merchantRaw,
      amount: Math.abs(amountNum),
      category: categorize(merchantRaw),
      isInstallment: false,
      isCancelled: amountNum < 0,
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

function showConfirm(title, desc, onOk) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmDesc').textContent  = desc;
  const btn = document.getElementById('confirmOkBtn');
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
  if (tab === 'keywords')  renderKeywords();
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
  const all     = JSON.parse(localStorage.getItem(SK.TX) || '{}');
  const txs     = all[state.ym]              || [];
  const prevTxs = all[getPrevYM(state.ym)]   || [];

  const active     = txs.filter(t => !t.isCancelled);
  const total      = active.reduce((s, t) => s + t.amount, 0);
  const prevActive = prevTxs.filter(t => !t.isCancelled);
  const prevTotal  = prevActive.reduce((s, t) => s + t.amount, 0);

  document.getElementById('totalAmount').textContent = fmtAmt(total);
  document.getElementById('monthLabel').textContent  = fmtYM(state.ym);
  const txCountEl = document.getElementById('txCount');
  if (txCountEl) txCountEl.textContent = `${active.length}건`;

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

  if (state.rightTab === 'calendar') {
    const listCountEl = document.getElementById('listCount');
    if (listCountEl) listCountEl.textContent = `${active.length}건`;
    renderCalendar(txs);
  } else {
    renderDetailTabs();
    renderTxList(txs);
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
  container.innerHTML = Object.entries(map).map(([kw, cat]) => `
    <div class="card" style="padding:10px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:13px;"><span style="font-weight:700;">${kw}</span> → ${cat}</div>
      <button onclick="removeKeyword('${kw}')" style="color:#EF4444;background:none;border:none;cursor:pointer;font-size:12px;">삭제</button>
    </div>
  `).join('');
  const sel = document.getElementById('newCategory');
  if (sel) sel.innerHTML = Object.keys(CATEGORIES).map(c => `<option value="${c}">${c}</option>`).join('');
}

function openCategoryModal(idx) {
  state.modalIdx = idx;
  const tx = state.pending[idx];
  document.getElementById('modalMerchant').textContent = `${tx.merchant} (${fmtAmt(tx.amount)})`;
  document.getElementById('categoryOptions').innerHTML = Object.keys(CATEGORIES).map(cat => `
    <button onclick="selectCategory('${cat}')" style="padding:8px;font-size:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);cursor:pointer;">${cat}</button>
  `).join('');
  document.getElementById('categoryModal').classList.remove('hidden');
}

function closeModal() { document.getElementById('categoryModal').classList.add('hidden'); }

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

/* ── 초기화 ── */
document.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem(SK.KW)) saveKwMap(DEFAULT_KEYWORD_MAP);
  if (localStorage.getItem(SK.DARK) === 'true') document.documentElement.classList.add('dark');
  if (localStorage.getItem(SK.LAYOUT) === 'pc') document.documentElement.classList.add('pc-mode');

  const pre = document.getElementById('sampleRawText');
  if (pre) pre.textContent = SAMPLE_RAW_TEXT;

  syncUI();
  switchTab('dashboard');
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
  all[state.ym] = [...(all[state.ym] || []), ...state.pending];
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
window.loadDemoData = () => {
  const ym = state.ym;
  const demo = [
    { id:genId(), merchant:'스타벅스',   amount:5500,  category:'식비',      date:`${ym}-05`, isInstallment:false, isCancelled:false },
    { id:genId(), merchant:'배달의민족',  amount:24000, category:'식비',      date:`${ym}-08`, isInstallment:false, isCancelled:false },
    { id:genId(), merchant:'카카오 택시', amount:8900,  category:'교통',      date:`${ym}-10`, isInstallment:false, isCancelled:false },
    { id:genId(), merchant:'쿠팡',        amount:35000, category:'쇼핑/생활', date:`${ym}-12`, isInstallment:false, isCancelled:false },
    { id:genId(), merchant:'LGU+ 통신',   amount:55000, category:'고정지출',  date:`${ym}-15`, isInstallment:false, isCancelled:false },
    { id:genId(), merchant:'올리브영',    amount:22000, category:'쇼핑/생활', date:`${ym}-18`, isInstallment:false, isCancelled:false },
    { id:genId(), merchant:'컴포즈커피',  amount:3500,  category:'식비',      date:`${ym}-20`, isInstallment:false, isCancelled:false },
  ];
  const all = JSON.parse(localStorage.getItem(SK.TX) || '{}');
  all[ym] = demo;
  localStorage.setItem(SK.TX, JSON.stringify(all));
  renderDashboard();
};
