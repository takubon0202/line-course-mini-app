/* ============================================
   if(塾) 見学予約アプリ - メインスクリプト
   ============================================ */

(function () {
  'use strict';

  // --- ストレージキー ---
  const STORAGE_KEY = 'ifJuku_reservations';

  // --- DOM要素取得 ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  const form = document.getElementById('reservation-form');
  const inputName = document.getElementById('input-name');
  const inputDate = document.getElementById('input-date');
  const inputTime = document.getElementById('input-time');
  const inputMemo = document.getElementById('input-memo');
  const errorName = document.getElementById('error-name');
  const errorDate = document.getElementById('error-date');
  const errorTime = document.getElementById('error-time');
  const reservationList = document.getElementById('reservation-list');
  const emptyState = document.getElementById('empty-state');
  const badgeCount = document.getElementById('badge-count');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalMessage = document.getElementById('modal-message');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalGcalBtn = document.getElementById('modal-gcal-btn');
  const submitBtn = document.getElementById('submit-btn');

  // --- 初期化 ---
  function init() {
    setupDateConstraints();
    setupTabs();
    setupForm();
    setupModal();
    renderReservations();
  }

  // --- 日付制約: 今日以降のみ選択可 ---
  function setupDateConstraints() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    inputDate.min = `${yyyy}-${mm}-${dd}`;

    // 3ヶ月先まで
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 3);
    const maxYyyy = maxDate.getFullYear();
    const maxMm = String(maxDate.getMonth() + 1).padStart(2, '0');
    const maxDd = String(maxDate.getDate()).padStart(2, '0');
    inputDate.max = `${maxYyyy}-${maxMm}-${maxDd}`;
  }

  // --- タブ切り替え ---
  function setupTabs() {
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;

        // タブボタンのアクティブ状態
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // パネル表示切り替え
        panels.forEach(panel => {
          panel.classList.remove('active');
          if (panel.id === `panel-${targetTab}`) {
            panel.classList.add('active');
          }
        });

        // 一覧タブに切り替え時はリフレッシュ
        if (targetTab === 'list') {
          renderReservations();
        }
      });
    });
  }

  // --- フォームセットアップ ---
  function setupForm() {
    // リアルタイムバリデーション: フォーカスアウト時
    inputName.addEventListener('blur', () => validateField('name'));
    inputDate.addEventListener('blur', () => validateField('date'));
    inputDate.addEventListener('change', () => validateField('date'));
    inputTime.addEventListener('blur', () => validateField('time'));
    inputTime.addEventListener('change', () => validateField('time'));

    // エラー解除: 入力時
    inputName.addEventListener('input', () => clearError('name'));
    inputDate.addEventListener('input', () => clearError('date'));
    inputTime.addEventListener('input', () => clearError('time'));

    // フォーム送信
    form.addEventListener('submit', handleSubmit);
  }

  // --- バリデーション ---
  function validateField(field) {
    switch (field) {
      case 'name': {
        const value = inputName.value.trim();
        if (!value) {
          showError('name', 'お名前を入力してください');
          return false;
        }
        if (value.length > 50) {
          showError('name', 'お名前は50文字以内で入力してください');
          return false;
        }
        clearError('name');
        return true;
      }
      case 'date': {
        const value = inputDate.value;
        if (!value) {
          showError('date', '見学希望日を選択してください');
          return false;
        }
        const selectedDate = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selectedDate < today) {
          showError('date', '本日以降の日付を選択してください');
          return false;
        }
        clearError('date');
        return true;
      }
      case 'time': {
        const value = inputTime.value;
        if (!value) {
          showError('time', '希望時間を選択してください');
          return false;
        }
        clearError('time');
        return true;
      }
      default:
        return true;
    }
  }

  function validateAll() {
    const results = [
      validateField('name'),
      validateField('date'),
      validateField('time'),
    ];
    return results.every(Boolean);
  }

  // --- エラー表示/解除 ---
  function showError(field, message) {
    const errorEl = document.getElementById(`error-${field}`);
    const inputEl = document.getElementById(`input-${field}`);
    errorEl.textContent = message;
    errorEl.classList.add('visible');
    inputEl.classList.add('error');
    inputEl.classList.add('shake');
    setTimeout(() => inputEl.classList.remove('shake'), 400);
  }

  function clearError(field) {
    const errorEl = document.getElementById(`error-${field}`);
    const inputEl = document.getElementById(`input-${field}`);
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
    inputEl.classList.remove('error');
  }

  // --- フォーム送信 ---
  function handleSubmit(e) {
    e.preventDefault();

    if (!validateAll()) {
      // 最初のエラーフィールドにフォーカス
      const firstError = form.querySelector('.form-input.error');
      if (firstError) {
        firstError.focus();
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // 送信中状態
    submitBtn.disabled = true;

    const reservation = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: inputName.value.trim(),
      date: inputDate.value,
      time: inputTime.value,
      memo: inputMemo.value.trim(),
      createdAt: new Date().toISOString(),
    };

    // 保存
    saveReservation(reservation);

    // フォームリセット
    form.reset();
    setupDateConstraints();
    ['name', 'date', 'time'].forEach(clearError);

    // モーダル表示
    const dateFormatted = formatDate(reservation.date);
    modalMessage.textContent = `${reservation.name}様の見学予約を受け付けました。\n${dateFormatted} ${reservation.time}〜`;

    // Googleカレンダー追加ボタンのURL設定
    modalGcalBtn.href = buildGoogleCalendarUrl(reservation);

    showModal();

    // バッジ更新
    updateBadge();

    // 送信ボタン復帰
    setTimeout(() => {
      submitBtn.disabled = false;
    }, 500);
  }

  // --- ストレージ操作 ---
  function getReservations() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function saveReservation(reservation) {
    const reservations = getReservations();
    reservations.unshift(reservation);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
  }

  function deleteReservation(id) {
    const reservations = getReservations().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
  }

  // --- 予約一覧レンダリング ---
  function renderReservations() {
    const reservations = getReservations();

    if (reservations.length === 0) {
      reservationList.innerHTML = '';
      emptyState.style.display = 'flex';
      updateBadge();
      return;
    }

    emptyState.style.display = 'none';

    reservationList.innerHTML = reservations.map((r, index) => `
      <div class="reservation-card" data-id="${r.id}" style="animation-delay: ${index * 0.06}s">
        <div class="card-header">
          <span class="card-name">${escapeHtml(r.name)}</span>
          <button class="delete-btn" data-id="${r.id}" aria-label="削除" title="この予約を削除">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
        <div class="card-details">
          <span class="card-detail">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            ${formatDate(r.date)}
          </span>
          <span class="card-detail">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            ${escapeHtml(r.time)}
          </span>
        </div>
        ${r.memo ? `<div class="card-memo">${escapeHtml(r.memo)}</div>` : ''}
        <a class="card-gcal-btn" href="${buildGoogleCalendarUrl(r)}" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
            <line x1="12" y1="14" x2="12" y2="18"/>
            <line x1="10" y1="16" x2="14" y2="16"/>
          </svg>
          Googleカレンダーに追加
        </a>
      </div>
    `).join('');

    // 削除ボタンイベント
    reservationList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', handleDelete);
    });

    updateBadge();
  }

  // --- 削除処理 ---
  function handleDelete(e) {
    const btn = e.currentTarget;
    const id = btn.dataset.id;
    const card = btn.closest('.reservation-card');

    if (!confirm('この予約を削除しますか？')) return;

    card.classList.add('deleting');
    setTimeout(() => {
      deleteReservation(id);
      renderReservations();
    }, 400);
  }

  // --- バッジ更新 ---
  function updateBadge() {
    const count = getReservations().length;
    if (count > 0) {
      badgeCount.textContent = count;
      badgeCount.style.display = 'inline-flex';
    } else {
      badgeCount.style.display = 'none';
    }
  }

  // --- モーダル ---
  function setupModal() {
    modalCloseBtn.addEventListener('click', hideModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) hideModal();
    });
  }

  function showModal() {
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function hideModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  // --- ユーティリティ ---
  function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    return `${year}/${month}/${day}(${weekday})`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Googleカレンダー URL生成 ---
  function buildGoogleCalendarUrl(reservation) {
    const dateStr = reservation.date.replace(/-/g, '');
    const timeParts = reservation.time.split(':');
    const startHour = parseInt(timeParts[0], 10);
    const startMin = timeParts[1] || '00';
    const endHour = startHour + 1;

    const startTime = `${dateStr}T${String(startHour).padStart(2, '0')}${startMin}00`;
    const endTime = `${dateStr}T${String(endHour).padStart(2, '0')}${startMin}00`;

    const title = encodeURIComponent(`【if(塾)】見学予約 - ${reservation.name}様`);
    const details = encodeURIComponent(
      `見学者: ${reservation.name}\n時間: ${reservation.time}〜` +
      (reservation.memo ? `\nメモ: ${reservation.memo}` : '')
    );
    const location = encodeURIComponent('if(塾)');

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startTime}/${endTime}&details=${details}&location=${location}&ctz=Asia/Tokyo`;
  }

  // --- 起動 ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
