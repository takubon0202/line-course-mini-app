/* ============================================
   if(塾) 見学予約アプリ - メインスクリプト
   GAS (Google Apps Script) 連携対応版
   ============================================ */

(function () {
  'use strict';

  // ============================================
  // 設定
  // ============================================

  /**
   * GAS Web App のデプロイURL
   * ※ GASデプロイ後にここにURLを貼り付けてください
   * 例: 'https://script.google.com/macros/s/XXXX/exec'
   */
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbz8qjI6MSbdnyGZot70LCWl3PCkfszePXrbOyb_Y0hRH2KBvpNne8zpvfdXcn8gYyn-/exec';

  /** ローカルストレージキー */
  const STORAGE_KEY = 'ifJuku_reservations';

  /** 静的フォールバック用スロット */
  const FALLBACK_SLOTS = [
    { time: '10:00', available: true, label: '10:00' },
    { time: '11:00', available: true, label: '11:00' },
    { time: '13:00', available: true, label: '13:00' },
    { time: '14:00', available: true, label: '14:00' },
    { time: '15:00', available: true, label: '15:00' },
    { time: '16:00', available: true, label: '16:00' },
    { time: '17:00', available: true, label: '17:00' },
    { time: '18:00', available: true, label: '18:00' },
  ];

  // ============================================
  // DOM要素取得
  // ============================================

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
  const connectionStatus = document.getElementById('connection-status');

  // ============================================
  // 初期化
  // ============================================

  function init() {
    setupDateConstraints();
    setupTabs();
    setupForm();
    setupModal();
    renderReservations();
    updateConnectionStatus();
  }

  // ============================================
  // 接続ステータス
  // ============================================

  function updateConnectionStatus() {
    if (!connectionStatus) return;
    if (GAS_URL) {
      connectionStatus.className = 'connection-badge connected';
      connectionStatus.innerHTML = `
        <span class="status-dot"></span>
        <span>カレンダー連携中</span>
      `;
    } else {
      connectionStatus.className = 'connection-badge offline';
      connectionStatus.innerHTML = `
        <span class="status-dot"></span>
        <span>オフラインモード</span>
      `;
    }
  }

  // ============================================
  // 日付制約: 今日以降のみ選択可
  // ============================================

  function setupDateConstraints() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    inputDate.min = `${yyyy}-${mm}-${dd}`;

    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 3);
    const maxYyyy = maxDate.getFullYear();
    const maxMm = String(maxDate.getMonth() + 1).padStart(2, '0');
    const maxDd = String(maxDate.getDate()).padStart(2, '0');
    inputDate.max = `${maxYyyy}-${maxMm}-${maxDd}`;
  }

  // ============================================
  // タブ切り替え
  // ============================================

  function setupTabs() {
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;

        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        panels.forEach(panel => {
          panel.classList.remove('active');
          if (panel.id === `panel-${targetTab}`) {
            panel.classList.add('active');
          }
        });

        if (targetTab === 'list') {
          renderReservations();
        }
      });
    });
  }

  // ============================================
  // フォームセットアップ
  // ============================================

  function setupForm() {
    inputName.addEventListener('blur', () => validateField('name'));
    inputDate.addEventListener('blur', () => validateField('date'));
    inputDate.addEventListener('change', handleDateChange);
    inputTime.addEventListener('blur', () => validateField('time'));
    inputTime.addEventListener('change', () => validateField('time'));

    inputName.addEventListener('input', () => clearError('name'));
    inputDate.addEventListener('input', () => clearError('date'));
    inputTime.addEventListener('input', () => clearError('time'));

    form.addEventListener('submit', handleSubmit);
  }

  // ============================================
  // 日付変更 → 空き時間取得
  // ============================================

  async function handleDateChange() {
    clearError('date');
    const dateValue = inputDate.value;
    if (!dateValue) return;

    if (!validateField('date')) return;

    if (GAS_URL) {
      await fetchAvailableSlots(dateValue);
    } else {
      populateStaticSlots();
    }
  }

  /**
   * GASから空き時間スロットを取得
   */
  async function fetchAvailableSlots(dateStr) {
    // ローディング表示
    inputTime.innerHTML = '<option value="">読み込み中...</option>';
    inputTime.disabled = true;
    inputTime.classList.add('loading');

    try {
      const url = `${GAS_URL}?action=getSlots&date=${dateStr}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.success && data.slots) {
        populateSlots(data.slots);
      } else {
        inputTime.innerHTML = '<option value="">取得エラー: ' + (data.error || '不明') + '</option>';
      }
    } catch (err) {
      console.error('空き時間取得エラー:', err);
      // フォールバック
      populateStaticSlots();
      inputTime.insertAdjacentHTML('afterbegin',
        '<option value="" disabled>⚠ カレンダー接続エラー（静的リスト表示中）</option>');
    } finally {
      inputTime.disabled = false;
      inputTime.classList.remove('loading');
    }
  }

  /**
   * スロットをselectに反映
   */
  function populateSlots(slots) {
    const availableSlots = slots.filter(s => s.available);

    if (availableSlots.length === 0) {
      inputTime.innerHTML = '<option value="">この日は空きがありません</option>';
      return;
    }

    let html = '<option value="">時間を選択してください</option>';
    slots.forEach(slot => {
      if (slot.available) {
        html += `<option value="${slot.time}">🟢 ${slot.time}</option>`;
      } else {
        html += `<option value="" disabled>🔴 ${slot.time}（予約済み）</option>`;
      }
    });

    inputTime.innerHTML = html;
  }

  /**
   * 静的フォールバックスロット
   */
  function populateStaticSlots() {
    let html = '<option value="">時間を選択してください</option>';
    FALLBACK_SLOTS.forEach(slot => {
      html += `<option value="${slot.time}">${slot.time}</option>`;
    });
    inputTime.innerHTML = html;
  }

  // ============================================
  // バリデーション
  // ============================================

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

  // ============================================
  // フォーム送信
  // ============================================

  async function handleSubmit(e) {
    e.preventDefault();

    if (!validateAll()) {
      const firstError = form.querySelector('.form-input.error');
      if (firstError) {
        firstError.focus();
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // 送信中UI
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = '送信中...';
    submitBtn.classList.add('submitting');

    const reservationData = {
      name: inputName.value.trim(),
      date: inputDate.value,
      time: inputTime.value,
      memo: inputMemo.value.trim(),
    };

    let gasSuccess = false;

    // GAS API へ送信
    if (GAS_URL) {
      try {
        const response = await fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(reservationData),
        });
        const result = await response.json();

        if (result.success) {
          gasSuccess = true;
        } else {
          // GASエラー（予約済みなど）
          alert('⚠ ' + (result.error || '予約に失敗しました'));
          submitBtn.disabled = false;
          submitBtn.querySelector('span').textContent = '予約を送信する';
          submitBtn.classList.remove('submitting');
          // スロットをリロード
          await fetchAvailableSlots(reservationData.date);
          return;
        }
      } catch (err) {
        console.error('GAS送信エラー:', err);
        alert('⚠ サーバーとの通信に失敗しました。予約はローカルのみ保存されます。');
      }
    }

    // ローカル保存
    const reservation = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ...reservationData,
      createdAt: new Date().toISOString(),
      synced: gasSuccess,
    };
    saveReservation(reservation);

    // フォームリセット
    form.reset();
    setupDateConstraints();
    populateStaticSlots();
    ['name', 'date', 'time'].forEach(clearError);

    // モーダル表示
    const dateFormatted = formatDate(reservation.date);
    modalMessage.textContent = `${reservation.name}様の見学予約を受け付けました。\n${dateFormatted} ${reservation.time}〜`;

    if (gasSuccess) {
      modalMessage.textContent += '\n✅ Googleカレンダーに登録しました';
    }

    modalGcalBtn.href = buildGoogleCalendarUrl(reservation);
    showModal();

    updateBadge();

    // 送信ボタン復帰
    submitBtn.disabled = false;
    submitBtn.querySelector('span').textContent = '予約を送信する';
    submitBtn.classList.remove('submitting');
  }

  // ============================================
  // ストレージ操作
  // ============================================

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

  // ============================================
  // 予約一覧レンダリング
  // ============================================

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
          <span class="card-name">
            ${escapeHtml(r.name)}
            ${r.synced ? '<span class="synced-badge" title="カレンダー連携済み">✅</span>' : ''}
          </span>
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

    reservationList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', handleDelete);
    });

    updateBadge();
  }

  // ============================================
  // 削除処理
  // ============================================

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

  // ============================================
  // バッジ更新
  // ============================================

  function updateBadge() {
    const count = getReservations().length;
    if (count > 0) {
      badgeCount.textContent = count;
      badgeCount.style.display = 'inline-flex';
    } else {
      badgeCount.style.display = 'none';
    }
  }

  // ============================================
  // モーダル
  // ============================================

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

  // ============================================
  // ユーティリティ
  // ============================================

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

  // ============================================
  // 起動
  // ============================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
