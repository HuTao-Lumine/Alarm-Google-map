import { point, lineString, pointToLineDistance } from '@turf/turf';

/**
 * Tính khoảng cách ngắn nhất (Cross-track distance) từ vị trí hiện tại đến tuyến đường (Polyline).
 * 
 * @param {{ latitude: number, longitude: number }} currentCoord - Tọa độ vị trí hiện tại của user
 * @param {Array<{ latitude: number, longitude: number }>} routeCoords - Danh sách tọa độ cấu thành Polyline
 * @returns {number} Khoảng cách tính bằng mét (m)
 */
export function calculateCrossTrackDistance(currentCoord, routeCoords) {
  if (!currentCoord || !routeCoords || routeCoords.length < 2) {
    return 0;
  }

  try {
    // Turf GeoJSON sử dụng định dạng [longitude, latitude] (kinh độ trước, vĩ độ sau)
    const userPoint = point([currentCoord.longitude, currentCoord.latitude]);

    const lineCoords = routeCoords.map((coord) => [
      coord.longitude,
      coord.latitude,
    ]);

    const routeLine = lineString(lineCoords);

    // Tính khoảng cách từ điểm đến đường thẳng/đoạn gấp khúc bằng mét
    const distanceInMeters = pointToLineDistance(userPoint, routeLine, {
      units: 'meters',
    });

    return Math.round(distanceInMeters * 10) / 10; // Làm tròn 1 chữ số thập phân
  } catch (error) {
    console.warn('Lỗi khi tính toán khoảng cách Turf:', error);
    return 0;
  }
}

/**
 * Tính khoảng cách đường chim bay giữa 2 điểm (mét)
 */
export function getDistanceMeters(coord1, coord2) {
  if (!coord1 || !coord2) return 0;
  const R = 6371000; // mét
  const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.latitude * Math.PI) / 180) *
      Math.cos((coord2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Cắt ngắn tuyến đường khi người dùng di chuyển về phía trước (Giống Google Maps)
 * - Khi đang đi đúng tuyến (<= safetyRadius): Tuyến đường vẽ ngắn lại theo sau lưng xe.
 * - Khi đi chệch ra xa (> safetyRadius): TUYỆT ĐỐI KHÔNG CẮT NGẮN, giữ nguyên lộ trình để không bị nhầm lẫn.
 * 
 * @param {{ latitude: number, longitude: number }} currentCoord - Vị trí hiện tại của xe
 * @param {Array<{ latitude: number, longitude: number }>} fullRoute - Toàn bộ lộ trình gốc
 * @param {number} lastPassedIndex - Chỉ số index của điểm gần nhất đã vượt qua
 * @param {number} safetyRadiusMeters - Bán kính an toàn (mặc định 200m)
 * @returns {{ remainingCoords: Array<{latitude: number, longitude: number}>, newPassedIndex: number, remainingDistanceMeters: number }}
 */
export function updateDynamicRouteProgress(currentCoord, fullRoute, lastPassedIndex = 0, safetyRadiusMeters = 200) {
  if (!currentCoord || !fullRoute || fullRoute.length < 2) {
    return {
      remainingCoords: fullRoute || [],
      newPassedIndex: lastPassedIndex,
      remainingDistanceMeters: 0,
    };
  }

  // 1. Tính độ lệch từ xe đến toàn bộ lộ trình
  const crossTrackDist = calculateCrossTrackDistance(currentCoord, fullRoute);

  // Nếu đã chệch ra xa ngoài ngưỡng an toàn (> 200m): KHÔNG CẮT LỘ TRÌNH để tránh nhầm lẫn!
  if (crossTrackDist > safetyRadiusMeters) {
    return {
      remainingCoords: [currentCoord, ...fullRoute.slice(Math.max(0, lastPassedIndex))],
      newPassedIndex: lastPassedIndex,
      remainingDistanceMeters: calculateTotalPolylineLengthMeters(fullRoute.slice(lastPassedIndex)),
      isDeviated: true,
      crossTrackDist,
    };
  }

  // 2. Nếu đang đi đúng lộ trình: Tìm điểm gần nhất phía trước (giới hạn cửa sổ quét 25 điểm phía trước để tránh nhảy cóc khi đường vòng vèo)
  const maxSearchIndex = Math.min(fullRoute.length - 1, lastPassedIndex + 25);
  let closestIndex = lastPassedIndex;
  let minDistance = getDistanceMeters(currentCoord, fullRoute[lastPassedIndex]);

  for (let i = lastPassedIndex; i <= maxSearchIndex; i++) {
    const dist = getDistanceMeters(currentCoord, fullRoute[i]);
    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = i;
    }
  }

  // Cập nhật mốc index đã vượt qua (chỉ tiến về phía trước, không lùi)
  const newPassedIndex = Math.max(lastPassedIndex, closestIndex);

  // Danh sách tọa độ còn lại: Bắt đầu từ vị trí hiện tại của xe -> các điểm còn lại đến đích
  let remainingCoords = [];
  if (newPassedIndex >= fullRoute.length - 1) {
    // Đã đến điểm cuối cùng
    remainingCoords = [currentCoord, fullRoute[fullRoute.length - 1]];
  } else {
    remainingCoords = [currentCoord, ...fullRoute.slice(newPassedIndex + 1)];
  }

  const remainingDistanceMeters = calculateTotalPolylineLengthMeters(remainingCoords);

  return {
    remainingCoords,
    newPassedIndex,
    remainingDistanceMeters,
    isDeviated: false,
    crossTrackDist,
  };
}

/**
 * Tính tổng chiều dài của một đường Polyline bằng mét
 */
export function calculateTotalPolylineLengthMeters(coords) {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += getDistanceMeters(coords[i], coords[i + 1]);
  }
  return Math.round(total);
}

/**
 * Định dạng khoảng cách hiển thị thân thiện với người dùng
 * @param {number} meters 
 * @returns {string}
 */
export function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}
