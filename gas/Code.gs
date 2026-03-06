/**
 * ==============================================
 * if(塾) 見学予約 - Google Apps Script バックエンド
 * ==============================================
 *
 * 【設定手順】
 * 1. https://script.google.com で新規プロジェクトを作成
 * 2. このファイルの内容を貼り付け
 * 3. 下の CALENDAR_ID を自分のGoogleカレンダーIDに変更
 *    （メインカレンダーの場合は自分のGmailアドレス）
 * 4. 「デプロイ」→「新しいデプロイ」
 *    - 種類: ウェブアプリ
 *    - 実行ユーザー: 自分
 *    - アクセス: 全員
 * 5. デプロイ後のURLをフロントエンドの app.js 内 GAS_URL に設定
 */

// ============================================
// 設定
// ============================================

/** @const {string} 連携するGoogleカレンダーID（自分のGmailアドレス or カレンダーID） */
const CALENDAR_ID = 'primary';

/** @const {number} 営業開始時間 */
const OPEN_HOUR = 10;

/** @const {number} 営業終了時間 */
const CLOSE_HOUR = 19;

/** @const {number} 1スロットの時間（分） */
const SLOT_DURATION_MIN = 60;

/** @const {string} イベントのタイトルプレフィックス */
const EVENT_PREFIX = '【if(塾)見学】';

// ============================================
// GET リクエスト: 空き時間スロット取得
// ============================================

/**
 * GETリクエストを処理する
 * パラメータ:
 *   action=getSlots : 空き時間スロットを取得
 *   date=YYYY-MM-DD : 対象日付
 *
 * @param {Object} e - リクエストイベント
 * @returns {ContentService.TextOutput} JSON レスポンス
 */
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'getSlots') {
      const dateStr = e.parameter.date;
      if (!dateStr) {
        return jsonResponse({ success: false, error: '日付が指定されていません' });
      }

      const slots = getAvailableSlots(dateStr);
      return jsonResponse({ success: true, slots: slots, date: dateStr });
    }

    return jsonResponse({ success: false, error: '不明なアクションです' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ============================================
// POST リクエスト: 予約登録
// ============================================

/**
 * POSTリクエストを処理する
 * ボディ (JSON):
 *   name: 名前
 *   date: YYYY-MM-DD
 *   time: HH:MM
 *   memo: メモ（任意）
 *
 * @param {Object} e - リクエストイベント
 * @returns {ContentService.TextOutput} JSON レスポンス
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { name, date, time, memo } = data;

    // バリデーション
    if (!name || !date || !time) {
      return jsonResponse({ success: false, error: '名前・日付・時間は必須です' });
    }

    // 日付・時間パース
    const timeParts = time.split(':');
    const startHour = parseInt(timeParts[0], 10);
    const startMin = parseInt(timeParts[1] || '0', 10);

    const startDate = new Date(date + 'T' + 
      String(startHour).padStart(2, '0') + ':' + 
      String(startMin).padStart(2, '0') + ':00');
    const endDate = new Date(startDate.getTime() + SLOT_DURATION_MIN * 60 * 1000);

    // 空き確認
    const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!calendar) {
      return jsonResponse({ success: false, error: 'カレンダーが見つかりません。CALENDAR_IDを確認してください。' });
    }

    const events = calendar.getEvents(startDate, endDate);
    if (events.length > 0) {
      return jsonResponse({ 
        success: false, 
        error: 'この時間帯はすでに予約が入っています。他の時間をお選びください。' 
      });
    }

    // カレンダーイベント作成
    const title = EVENT_PREFIX + name + '様';
    const description = [
      '見学者: ' + name,
      '時間: ' + time + '〜',
      memo ? 'メモ: ' + memo : '',
      '',
      '※ if(塾) 見学予約アプリから自動登録'
    ].filter(Boolean).join('\n');

    const event = calendar.createEvent(title, startDate, endDate, {
      description: description,
      location: 'if(塾)',
    });

    return jsonResponse({
      success: true,
      message: '予約が完了しました',
      eventId: event.getId(),
      reservation: {
        name: name,
        date: date,
        time: time,
        memo: memo || '',
      }
    });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ============================================
// 空き時間スロット計算
// ============================================

/**
 * 指定日の空き時間スロットを取得する
 * 
 * @param {string} dateStr - YYYY-MM-DD 形式の日付
 * @returns {Array<Object>} 空きスロット配列 [{time: "10:00", available: true}, ...]
 */
function getAvailableSlots(dateStr) {
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!calendar) {
    throw new Error('カレンダーが見つかりません');
  }

  // 対象日の営業時間全体のイベントを取得
  const dayStart = new Date(dateStr + 'T' + String(OPEN_HOUR).padStart(2, '0') + ':00:00');
  const dayEnd = new Date(dateStr + 'T' + String(CLOSE_HOUR).padStart(2, '0') + ':00:00');
  const events = calendar.getEvents(dayStart, dayEnd);

  // スロット生成
  const slots = [];
  const now = new Date();

  for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour++) {
    const slotStart = new Date(dateStr + 'T' + String(hour).padStart(2, '0') + ':00:00');
    const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MIN * 60 * 1000);

    // 過去の時間は表示しない
    if (slotStart < now) {
      continue;
    }

    // この時間帯にイベントがあるかチェック
    const isBooked = events.some(function(event) {
      const eventStart = event.getStartTime();
      const eventEnd = event.getEndTime();
      // 重なりチェック: スロット開始 < イベント終了 AND スロット終了 > イベント開始
      return slotStart < eventEnd && slotEnd > eventStart;
    });

    const timeStr = String(hour).padStart(2, '0') + ':00';

    slots.push({
      time: timeStr,
      available: !isBooked,
      label: timeStr + (isBooked ? '（予約済み）' : ''),
    });
  }

  return slots;
}

// ============================================
// ユーティリティ
// ============================================

/**
 * JSON レスポンスを生成する（CORS対応）
 * 
 * @param {Object} data - レスポンスデータ
 * @returns {ContentService.TextOutput} JSON形式のレスポンス
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// テスト用関数
// ============================================

/**
 * GASエディタ上で空き時間取得をテストする
 */
function testGetSlots() {
  // 今日の日付でテスト
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const slots = getAvailableSlots(today);
  Logger.log('日付: ' + today);
  Logger.log('空きスロット: ' + JSON.stringify(slots, null, 2));
}

/**
 * GASエディタ上で予約登録をテストする
 */
function testCreateReservation() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = Utilities.formatDate(tomorrow, 'Asia/Tokyo', 'yyyy-MM-dd');

  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        name: 'テスト太郎',
        date: dateStr,
        time: '14:00',
        memo: 'テスト予約です',
      })
    }
  };

  const result = doPost(mockEvent);
  Logger.log(result.getContent());
}
