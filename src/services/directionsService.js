import polyline from '@mapbox/polyline';
import * as Location from 'expo-location';
import { CONFIG } from '../config';

/**
 * Tính khoảng cách đường chim bay giữa 2 tọa độ (km) theo công thức Haversine
 */
function getHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Bán kính Trái Đất (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDist(km) {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Tìm kiếm danh sách gợi ý địa chỉ (Ưu tiên tuyệt đối các địa điểm GẦN NGƯỜI DÙNG NHẤT)
 * 
 * @param {string} query - Tên địa chỉ/địa điểm người dùng gõ
 * @param {{ latitude: number, longitude: number }} [userLocation] - Vị trí GPS thực tế hiện tại
 * @returns {Promise<Array<{ title: string, sub: string, distText: string, coords: { latitude: number, longitude: number } }>>}
 */
export async function searchAddressSuggestions(query, userLocation) {
  if (!query || query.trim().length < 2) return [];

  const userLat = userLocation?.latitude;
  const userLon = userLocation?.longitude;

  const results = [];

  // 1. Thử dùng hệ thống Geocoding Native của thiết bị (rất nhạy với tên đường Việt Nam)
  try {
    const nativeResults = await Location.geocodeAsync(query.trim());
    if (nativeResults && nativeResults.length > 0) {
      for (const item of nativeResults.slice(0, 3)) {
        let distKm = 0;
        if (userLat && userLon) {
          distKm = getHaversineDistanceKm(userLat, userLon, item.latitude, item.longitude);
        }
        results.push({
          title: query.trim(),
          sub: 'Địa chỉ theo định vị thiết bị',
          distKm,
          distText: userLat ? `Cách bạn ${formatDist(distKm)}` : '',
          coords: {
            latitude: item.latitude,
            longitude: item.longitude,
          },
        });
      }
    }
  } catch (_) {
    // Bỏ qua nếu native geocoder không khả dụng
  }

  // 2. Tìm kiếm qua Photon Geocoder kết hợp định vị GPS của người dùng
  const latParam = userLat ? `&lat=${userLat}&lon=${userLon}` : '';
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query.trim())}${latParam}&limit=15`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data && data.features) {
      for (const f of data.features) {
        const p = f.properties;
        const [lon, lat] = f.geometry.coordinates;

        let distKm = 0;
        if (userLat && userLon) {
          distKm = getHaversineDistanceKm(userLat, userLon, lat, lon);
        }

        const parts = [
          p.housenumber,
          p.street,
          p.district || p.suburb || p.county,
          p.city || p.state,
        ].filter(Boolean);

        results.push({
          title: p.name || parts[0] || query.trim(),
          sub: parts.join(', ') || p.country || 'Việt Nam',
          distKm,
          distText: userLat ? `Cách bạn ${formatDist(distKm)}` : '',
          coords: { latitude: lat, longitude: lon },
        });
      }
    }
  } catch (error) {
    console.warn('Lỗi tìm kiếm Photon:', error);
  }

  // 3. Sắp xếp thông minh: Ưu tiên những nơi CÁCH NGƯỜI DÙNG GẦN NHẤT
  if (userLat && userLon) {
    results.sort((a, b) => a.distKm - b.distKm);
  }

  // Loại bỏ các địa điểm trùng tọa độ hoặc quá giống nhau
  const unique = [];
  const seen = new Set();
  for (const item of results) {
    const key = `${item.coords.latitude.toFixed(4)}_${item.coords.longitude.toFixed(4)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
    if (unique.length >= 6) break;
  }

  return unique;
}

/**
 * Lấy lộ trình đường đi thực tế giữa Điểm xuất phát và Điểm đến
 * Tôn trọng tuyệt đối đường một chiều, dải phân cách và hướng di chuyển hợp pháp
 * 
 * @param {{ latitude: number, longitude: number }} origin - Điểm xuất phát
 * @param {string | { latitude: number, longitude: number, name?: string }} destination - Điểm đến
 * @param {number} [heading] - Hướng mũi xe hiện tại (0 - 360 độ)
 */
export async function getRouteDirections(origin, destination, heading) {
  if (!origin) {
    throw new Error('Chưa xác định được vị trí xuất phát của bạn.');
  }

  const apiKey = CONFIG.GOOGLE_MAPS_API_KEY;

  // Nếu có Google Maps API Key hợp lệ
  if (apiKey && apiKey !== 'YOUR_GOOGLE_MAPS_API_KEY_HERE') {
    try {
      return await fetchGoogleDirections(origin, destination, apiKey);
    } catch (googleError) {
      console.warn('Lỗi Google Directions API, tự động chuyển sang Open Routing:', googleError);
    }
  }

  // Chế độ định tuyến thực tế thông minh (Valhalla + OSRM FOSSGIS)
  return await fetchOpenStreetMapRoute(origin, destination, heading);
}

/**
 * Định tuyến đường phố thông minh:
 * - Ưu tiên 1: Valhalla Engine (Tôn trọng tuyệt đối đường 1 chiều, cấm rẽ, dải phân cách cứng)
 * - Ưu tiên 2: FOSSGIS OSRM Engine (OpenStreetMap.de - cập nhật mới nhất)
 * - Ưu tiên 3: OSRM Project router
 */
async function fetchOpenStreetMapRoute(origin, destination, heading) {
  let destCoord = null;
  let destinationName = 'Điểm đến đã chọn';

  if (typeof destination === 'object' && destination.latitude && destination.longitude) {
    destCoord = destination;
    destinationName = destination.name || `Tọa độ: ${destCoord.latitude.toFixed(4)}, ${destCoord.longitude.toFixed(4)}`;
  } else if (typeof destination === 'string') {
    const suggestions = await searchAddressSuggestions(destination, origin);
    if (suggestions && suggestions.length > 0) {
      destCoord = suggestions[0].coords;
      destinationName = `${suggestions[0].title} (${suggestions[0].sub})`;
    }
  }

  if (!destCoord) {
    throw new Error(`Không tìm thấy địa điểm gần bạn có tên "${destination}". Vui lòng gõ rõ hơn hoặc chạm trực tiếp lên bản đồ.`);
  }

  const validHeading = typeof heading === 'number' && !isNaN(heading) && heading >= 0 ? Math.round(heading) : null;

  // 1. THỬ VALHALLA ENGINE (Độ chính xác cao nhất về đường 1 chiều và luồng giao thông)
  try {
    const originLocation = {
      lat: origin.latitude,
      lon: origin.longitude,
    };
    if (validHeading !== null) {
      originLocation.heading = validHeading;
      originLocation.heading_tolerance = 60;
    }

    const valhallaPayload = {
      locations: [
        originLocation,
        { lat: destCoord.latitude, lon: destCoord.longitude }
      ],
      costing: 'auto',
      costing_options: {
        auto: {
          use_highways: 1.0,
          use_tolls: 0.5,
          country_crossing_penalty: 0
        }
      },
      directions_options: {
        units: 'kilometers',
        language: 'vi'
      }
    };

    const valhallaRes = await fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valhallaPayload)
    });

    if (valhallaRes.ok) {
      const valhallaData = await valhallaRes.json();
      if (valhallaData && valhallaData.trip && valhallaData.trip.legs && valhallaData.trip.legs.length > 0) {
        const leg = valhallaData.trip.legs[0];
        // Valhalla mã hóa shape bằng polyline precision 6
        const decodedPoints = polyline.decode(leg.shape, 6);
        const coords = decodedPoints.map(([latitude, longitude]) => ({
          latitude,
          longitude,
        }));

        const distanceKm = valhallaData.trip.summary.length.toFixed(1);
        const durationMin = Math.round(valhallaData.trip.summary.time / 60);

        return {
          coords,
          summary: destinationName,
          distanceText: `${distanceKm} km`,
          durationText: `${durationMin} phút`,
          destinationName,
          destinationCoord: destCoord,
        };
      }
    }
  } catch (valhallaErr) {
    console.warn('Valhalla routing không phản hồi, chuyển sang OSRM FOSSGIS:', valhallaErr.message);
  }

  // 2. DỰ PHÒNG 1: FOSSGIS OSRM ENGINE (Có bật continue_straight=true & bearings để không đi ngược chiều)
  try {
    let osrmUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${origin.longitude},${origin.latitude};${destCoord.longitude},${destCoord.latitude}?overview=full&geometries=geojson&continue_straight=true`;
    if (validHeading !== null) {
      osrmUrl += `&bearings=${validHeading},60;`;
    }

    const routeRes = await fetch(osrmUrl);
    if (routeRes.ok) {
      const routeData = await routeRes.json();
      if (routeData.code === 'Ok' && routeData.routes && routeData.routes.length > 0) {
        const route = routeData.routes[0];
        const coords = route.geometry.coordinates.map(([lon, lat]) => ({
          latitude: lat,
          longitude: lon,
        }));

        const distanceKm = (route.distance / 1000).toFixed(1);
        const durationMin = Math.round(route.duration / 60);

        return {
          coords,
          summary: destinationName,
          distanceText: `${distanceKm} km`,
          durationText: `${durationMin} phút`,
          destinationName,
          destinationCoord: destCoord,
        };
      }
    }
  } catch (osrmFossErr) {
    console.warn('FOSSGIS OSRM không phản hồi, thử OSRM Project:', osrmFossErr.message);
  }

  // 3. DỰ PHÒNG 2: OSRM PROJECT
  const fallbackUrl = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destCoord.longitude},${destCoord.latitude}?overview=full&geometries=geojson&continue_straight=true`;
  const fallbackRes = await fetch(fallbackUrl);
  const fallbackData = await fallbackRes.json();

  if (fallbackData.code === 'Ok' && fallbackData.routes && fallbackData.routes.length > 0) {
    const route = fallbackData.routes[0];
    const coords = route.geometry.coordinates.map(([lon, lat]) => ({
      latitude: lat,
      longitude: lon,
    }));

    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMin = Math.round(route.duration / 60);

    return {
      coords,
      summary: destinationName,
      distanceText: `${distanceKm} km`,
      durationText: `${durationMin} phút`,
      destinationName,
      destinationCoord: destCoord,
    };
  }

  throw new Error('Không thể tìm thấy tuyến đường hợp lệ đến địa điểm này.');
}

async function fetchGoogleDirections(origin, destination, apiKey) {
  const originParam = `${origin.latitude},${origin.longitude}`;
  const destParam = typeof destination === 'string'
    ? encodeURIComponent(destination)
    : `${destination.latitude},${destination.longitude}`;

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originParam}&destination=${destParam}&mode=driving&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
    throw new Error(data.error_message || `Google Maps: Không tìm thấy đường (Mã: ${data.status})`);
  }

  const route = data.routes[0];
  const leg = route.legs[0];
  const encodedPolyline = route.overview_polyline.points;

  const decodedPoints = polyline.decode(encodedPolyline);
  const coords = decodedPoints.map(([latitude, longitude]) => ({
    latitude,
    longitude,
  }));

  return {
    coords,
    summary: route.summary || leg?.end_address || 'Tuyến đường Google Maps',
    distanceText: leg?.distance?.text || '',
    durationText: leg?.duration?.text || '',
    destinationName: leg?.end_address || 'Điểm đến',
    destinationCoord: coords[coords.length - 1],
  };
}
