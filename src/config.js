/**
 * Cấu hình toàn bộ ứng dụng (Application Configuration)
 */

export const CONFIG = {
  // Thay thế API Key của Google Maps Platform tại đây:
  // Cần kích hoạt: "Directions API", "Maps SDK for Android" (nếu build native) và "Geocoding API"
  GOOGLE_MAPS_API_KEY: 'YOUR_GOOGLE_MAPS_API_KEY_HERE',

  // Bán kính an toàn tối đa cho phép xe đi chệch khỏi lộ trình (mét)
  SAFETY_RADIUS_METERS: 200,

  // Thời gian tối đa (giây) xe nằm ngoài bán kính an toàn trước khi kích hoạt còi báo động khẩn cấp
  DEVIATION_TIME_LIMIT_SECONDS: 15,

  // Tần suất cập nhật vị trí GPS (mili-giây)
  LOCATION_UPDATE_INTERVAL_MS: 3000,
  LOCATION_FASTEST_INTERVAL_MS: 2000,
  LOCATION_DISTANCE_FILTER_METERS: 5,

  // Âm thanh còi báo động khẩn cấp (Siren Audio)
  // File mp3 siren trực tuyến chất lượng cao, có thể thay thế bằng file local: require('../../assets/siren.mp3')
  SIREN_AUDIO_URL: 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg',
  FALLBACK_SIREN_URL: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'
};
