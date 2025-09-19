// インメモリ統計データ
let initialRoomStats = [];
let lastUpdateTime = null;

// 統計データを毎日0時にリセットする関数
function initializeStats() {
  // 現在時刻を取得
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  const timeToMidnight = midnight.getTime() - now.getTime();

  // 最初の実行時にデータを取得
  (async () => {
    try {
      const roomlist = await getChatworkRoomlist();
      if (roomlist) {
        initialRoomStats = roomlist;
        lastUpdateTime = now.toISOString();
        console.log("初期統計データを取得しました。");
      }
    } catch (error) {
      console.error("初期統計データの取得に失敗しました:", error.message);
    }
  })();

  // 毎日0時にこの関数を再度実行する
  setTimeout(() => {
    // 翌日の0時に再実行
    initializeStats();
  }, timeToMidnight);
}

// ボット起動時に統計処理を開始
initializeStats();
