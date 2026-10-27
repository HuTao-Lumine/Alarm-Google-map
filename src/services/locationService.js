import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { CONFIG } from '../config';
import { logger } from './loggerService';

export const BACKGROUND_LOCATION_TASK = 'BUS_SAFETY_BACKGROUND_TRACKING';

// Listener lưu trữ callback cập nhật vị trí toàn cục
let onLocationUpdateCallback = null;

export function registerLocationListener(callback) {
  onLocationUpdateCallback = callback;
}

export function unregisterLocationListener() {
  onLocationUpdateCallback = null;
}

// Định nghĩa TaskManager chạy ngầm (Background Task)
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }) => {
  if (error) {
    logger.error('Lỗi Background Location Task', error.message);
    return;
  }
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const latest = locations[locations.length - 1];
      logger.task(`Nhận tọa độ chạy ngầm: ${latest.coords.latitude.toFixed(5)}, ${latest.coords.longitude.toFixed(5)} (Sai số: ${Math.round(latest.coords.accuracy || 0)}m)`);
      if (onLocationUpdateCallback) {
        onLocationUpdateCallback(latest.coords);
      }
    }
  }
});

/**
 * Xin quyền vị trí cả Foreground (khi mở app) và Background (khi chạy ngầm)
 */
export async function requestLocationPermissions() {
  // 1. Quyền Foreground
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    logger.error('Quyền vị trí Foreground bị từ chối');
    throw new Error('Ứng dụng cần quyền vị trí khi mở (Foreground) để theo dõi hành trình.');
  }

  // 2. Quyền Background
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  const hasBackground = bgStatus === 'granted';

  logger.info(`Quyền GPS: Foreground=${fgStatus}, Background=${bgStatus}`);
  return { foreground: true, background: hasBackground };
}

/**
 * Lấy vị trí GPS hiện tại ngay lập tức
 */
export async function getCurrentLocation() {
  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  logger.gps(`Vị trí GPS ban đầu: ${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)} (Sai số: ${Math.round(loc.coords.accuracy || 0)}m)`);
  return loc.coords;
}

/**
 * Bắt đầu theo dõi vị trí nền (Background Tracking)
 */
export async function startBackgroundLocationTracking() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: CONFIG.LOCATION_UPDATE_INTERVAL_MS,
        distanceInterval: CONFIG.LOCATION_DISTANCE_FILTER_METERS,
        foregroundService: {
          notificationTitle: 'Bảo vệ an toàn chuyến đi xe buýt',
          notificationBody: 'Đang theo dõi vị trí để cảnh báo chệch lộ trình.',
          notificationColor: '#E53E3E',
        },
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
      });
      logger.info('Đã bật Background Service theo dõi vị trí ngầm');
    }
  } catch (error) {
    logger.error('Cảnh báo Background Tracking (chưa bật "Luôn cho phép")', error.message);
  }
}

/**
 * Dừng theo dõi vị trí nền
 */
export async function stopBackgroundLocationTracking() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      logger.info('Đã dừng Background Service theo dõi vị trí ngầm');
    }
  } catch (err) {
    logger.error('Lỗi khi dừng background tracking', err.message);
  }
}
