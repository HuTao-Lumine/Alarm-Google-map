import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { CONFIG } from './src/config';
import {
  calculateCrossTrackDistance,
  updateDynamicRouteProgress,
  formatDistance,
} from './src/utils/geoUtils';
import { getRouteDirections, searchAddressSuggestions } from './src/services/directionsService';
import { alarmService } from './src/services/alarmService';
import {
  requestLocationPermissions,
  getCurrentLocation,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  registerLocationListener,
  unregisterLocationListener,
} from './src/services/locationService';
import { logger } from './src/services/loggerService';
import OpenStreetMapViewer from './src/components/OpenStreetMapViewer';
import SettingsModal from './src/components/SettingsModal';

const { width } = Dimensions.get('window');

export default function App() {
  const mapRef = useRef(null);

  // Vị trí hiện tại và hướng quay (Heading)
  const [currentLocation, setCurrentLocation] = useState(null);
  const [userHeading, setUserHeading] = useState(0);

  // Tuyến đường: Lộ trình gốc đầy đủ & Tọa độ đoạn đường còn lại đang hiển thị
  const [destinationInput, setDestinationInput] = useState('');
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const fullRouteCoordsRef = useRef([]);
  const lastPassedIndexRef = useRef(0);

  const [routeInfo, setRouteInfo] = useState(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // Cấu hình vùng an toàn (Đường kính & Bán kính)
  // Mặc định đường kính 400m -> bán kính 200m
  const [safetyDiameter, setSafetyDiameter] = useState(400);
  const safetyRadius = Math.round(safetyDiameter / 2);

  // Cấu hình thời gian tự động vẽ lại đường nếu lệch an toàn (Mặc định 30 phút)
  const [autoRerouteMinutes, setAutoRerouteMinutes] = useState(30);
  const safeDetourStartTimeRef = useRef(null);

  // Modal Cài đặt & Tiện ích
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);

  // Danh sách gợi ý địa điểm chính xác (Autocomplete)
  const [suggestions, setSuggestions] = useState([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const searchTimeoutRef = useRef(null);

  // Trạng thái chuyến đi & Báo động
  const [isTripActive, setIsTripActive] = useState(false);
  const [tripStatus, setTripStatus] = useState('IDLE'); // 'IDLE' | 'SAFE' | 'WARNING' | 'ALARM'
  const [crossTrackDistance, setCrossTrackDistance] = useState(0);
  const [deviationSeconds, setDeviationSeconds] = useState(0);

  // Timer đếm giây khi bị chệch hướng
  const deviationTimerRef = useRef(null);
  const isAlarmingRef = useRef(false);

  // Trạng thái xuất file log
  const [isExportingLog, setIsExportingLog] = useState(false);

  // 1. Khởi tạo quyền vị trí & lấy tọa độ ban đầu
  useEffect(() => {
    (async () => {
      try {
        await requestLocationPermissions();
        const coords = await getCurrentLocation();
        setCurrentLocation(coords);

        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: coords.latitude,
            longitude: coords.longitude,
            zoom: 15,
          });
        }
      } catch (err) {
        Alert.alert('Quyền truy cập bị từ chối', err.message);
      }
    })();

    // Lắng nghe cập nhật vị trí nền & tiền cảnh
    registerLocationListener((coords) => {
      handleNewLocationUpdate(coords);
    });

    return () => {
      unregisterLocationListener();
      alarmService.stopAlarm();
      clearInterval(deviationTimerRef.current);
    };
  }, []);

  // 2. Lắng nghe cảm biến la bàn / góc quay thiết bị (Compass Heading)
  const prevHeadingRef = useRef(0);
  useEffect(() => {
    let headingSub = null;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          headingSub = await Location.watchHeadingAsync((headingData) => {
            const h =
              headingData.trueHeading >= 0
                ? headingData.trueHeading
                : headingData.magHeading;
            if (typeof h === 'number' && !isNaN(h)) {
              const rounded = Math.round(h);
              // Lọc độ rung nhẹ của tay (< 2 độ thì không re-render)
              const diff = Math.abs(((rounded - (prevHeadingRef.current % 360) + 540) % 360) - 180);
              if (diff >= 2) {
                prevHeadingRef.current = rounded;
                setUserHeading(rounded);
              }
            }
          });
        }
      } catch (err) {
        logger.warn('Không thể khởi chạy cảm biến la bàn: ' + err.message);
      }
    })();

    return () => {
      if (headingSub) {
        headingSub.remove();
      }
    };
  }, []);

  // 3. Lắng nghe cập nhật GPS liên tục khi app mở foreground
  useEffect(() => {
    let foregroundSub = null;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        foregroundSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: CONFIG.LOCATION_UPDATE_INTERVAL_MS,
            distanceInterval: CONFIG.LOCATION_DISTANCE_FILTER_METERS,
          },
          (loc) => {
            handleNewLocationUpdate(loc.coords);
          }
        );
      }
    })();

    return () => {
      if (foregroundSub) {
        foregroundSub.remove();
      }
    };
  }, [isTripActive, safetyDiameter]);

  /**
   * Tự động tính toán lại lộ trình từ vị trí hiện tại đến điểm đến đã chọn
   */
  const recalculateRouteFromCurrentLocation = async (coords) => {
    const currentPos = coords || currentLocation;
    if (!currentPos) return;

    const dest =
      routeInfo?.destinationCoord ||
      (fullRouteCoordsRef.current.length > 0
        ? fullRouteCoordsRef.current[fullRouteCoordsRef.current.length - 1]
        : null);

    if (!dest) {
      logger.warn('Chưa có thông tin điểm đến để vẽ lại đường.');
      return;
    }

    try {
      logger.route(
        `🔄 Đang tự động cập nhật lại đường vẽ mới sau ${autoRerouteMinutes} phút di chuyển trong mức an toàn...`
      );
      const result = await getRouteDirections(currentPos, dest, userHeading);

      fullRouteCoordsRef.current = result.coords;
      lastPassedIndexRef.current = 0;
      setRouteCoordinates(result.coords);
      setRouteInfo((prev) => ({
        ...prev,
        ...result,
        summary: prev?.summary || result.summary,
      }));

      logger.route(
        `✅ Đã cập nhật xong đường vẽ mới: ${result.distanceText}, ${result.durationText} (${result.coords.length} điểm)`
      );
    } catch (err) {
      logger.warn('Không thể tự động vẽ lại đường: ' + err.message);
    }
  };

  /**
   * Xử lý mỗi khi có tọa độ GPS mới từ thiết bị
   */
  const handleNewLocationUpdate = (coords) => {
    setCurrentLocation(coords);

    // Cập nhật hướng di chuyển từ GPS nếu có
    if (typeof coords.heading === 'number' && coords.heading >= 0) {
      setUserHeading(Math.round(coords.heading));
    }

    logger.gps(
      `GPS: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)} | Hướng: ${Math.round(coords.heading || userHeading)}° | Sai số: ${Math.round(coords.accuracy || 0)}m`
    );

    // Chỉ tính toán và cắt ngắn lộ trình nếu chuyến đi đang diễn ra và có tuyến đường
    if (!isTripActive || fullRouteCoordsRef.current.length < 2) {
      return;
    }

    // Cắt ngắn lộ trình động khi đi đúng tuyến; giữ nguyên nếu chệch tuyến > safetyRadius
    const progress = updateDynamicRouteProgress(
      coords,
      fullRouteCoordsRef.current,
      lastPassedIndexRef.current,
      safetyRadius
    );

    lastPassedIndexRef.current = progress.newPassedIndex;
    setRouteCoordinates(progress.remainingCoords);
    setCrossTrackDistance(progress.crossTrackDist);

    if (!progress.isDeviated) {
      // Đang nằm trong vùng an toàn (<= safetyRadius)
      if (deviationTimerRef.current) {
        clearInterval(deviationTimerRef.current);
        deviationTimerRef.current = null;
      }
      setDeviationSeconds(0);

      // Nếu đang báo động thì tự động tắt và khôi phục âm lượng khi xe quay về an toàn
      if (isAlarmingRef.current) {
        alarmService.stopAlarm();
        isAlarmingRef.current = false;
        logger.info('Xe đã quay trở lại lộ trình an toàn');
      }
      setTripStatus('SAFE');

      // TỰ ĐỘNG CẬP NHẬT ĐƯỜNG VẼ:
      // Nếu người dùng di chuyển lệch khỏi tim đường gốc (> 15m) nhưng vẫn trong mức an toàn (<= safetyRadius)
      // liên tục trong khoảng thời gian đã định (mặc định 30 phút), ứng dụng tự động vẽ lại đường mới.
      if (progress.crossTrackDist > 15) {
        if (safeDetourStartTimeRef.current === null) {
          safeDetourStartTimeRef.current = Date.now();
          logger.info(
            `Đang lệch an toàn ${formatDistance(progress.crossTrackDist)}: Hẹn giờ ${autoRerouteMinutes} phút tự động vẽ lại đường.`
          );
        } else {
          const elapsed = Date.now() - safeDetourStartTimeRef.current;
          const targetMs = autoRerouteMinutes * 60 * 1000;
          if (elapsed >= targetMs) {
            safeDetourStartTimeRef.current = Date.now();
            recalculateRouteFromCurrentLocation(coords);
          }
        }
      } else {
        // Đi sát tim đường ban đầu (<= 15m) -> Reset mốc lệch
        safeDetourStartTimeRef.current = null;
      }
    } else {
      // Vượt quá bán kính an toàn (> safetyRadius)
      safeDetourStartTimeRef.current = null; // Đã chệch nguy hiểm, ngưng tính thời gian an toàn
      logger.deviation(
        `Chệch lộ trình ${progress.crossTrackDist}m (Vượt ngưỡng an toàn ${safetyRadius}m / Đường kính ${safetyDiameter}m)`
      );

      if (!isAlarmingRef.current) {
        setTripStatus('WARNING');

        // Bắt đầu đếm thời gian chệch nếu chưa có timer
        if (!deviationTimerRef.current) {
          deviationTimerRef.current = setInterval(() => {
            setDeviationSeconds((prev) => {
              const nextVal = prev + 1;
              logger.deviation(
                `⏳ Đếm ngược kích hoạt còi: ${nextVal}s / ${CONFIG.DEVIATION_TIME_LIMIT_SECONDS}s`
              );
              if (nextVal >= CONFIG.DEVIATION_TIME_LIMIT_SECONDS) {
                // Đã chệch hướng vượt quá 15 giây -> KÍCH HOẠT CÒI BÁO ĐỘNG & MAX ÂM LƯỢNG!
                triggerAlarm();
              }
              return nextVal;
            });
          }, 1000);
        }
      }
    }
  };

  /**
   * Kích hoạt còi báo động khẩn cấp (Âm lượng 100% + Rung)
   */
  const triggerAlarm = () => {
    if (isAlarmingRef.current) return;
    isAlarmingRef.current = true;
    setTripStatus('ALARM');
    alarmService.startAlarm();
  };

  /**
   * Tắt báo động khẩn cấp, khôi phục âm lượng ban đầu và kết thúc chuyến đi
   */
  const handleDismissAlarmAndEndTrip = async () => {
    logger.info('⏹️ Đã bấm Tắt báo động & Kết thúc chuyến đi');
    await alarmService.stopAlarm();
    isAlarmingRef.current = false;
    clearInterval(deviationTimerRef.current);
    deviationTimerRef.current = null;
    safeDetourStartTimeRef.current = null;

    await stopBackgroundLocationTracking();
    setIsTripActive(false);
    setTripStatus('IDLE');
    setDeviationSeconds(0);
    setCrossTrackDistance(0);

    Alert.alert(
      'Đã kết thúc',
      'Còi báo động đã tắt, âm lượng máy đã khôi phục về ban đầu và chuyến đi đã dừng theo dõi.'
    );
  };

  /**
   * Xử lý khi người dùng gõ vào ô tìm kiếm: Tự động tải gợi ý địa điểm chi tiết
   */
  const handleInputChange = (text) => {
    setDestinationInput(text);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!text || text.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearchingSuggestions(true);
      const list = await searchAddressSuggestions(text, currentLocation);
      setSuggestions(list);
      setIsSearchingSuggestions(false);
    }, 400);
  };

  /**
   * Khi người dùng chạm chọn 1 địa chỉ cụ thể từ danh sách gợi ý
   */
  const handleSelectSuggestion = async (item) => {
    setDestinationInput(item.title);
    setSuggestions([]);

    if (!currentLocation) {
      Alert.alert('Chờ GPS', 'Đang xác định vị trí hiện tại của bạn...');
      return;
    }

    setIsLoadingRoute(true);
    try {
      const result = await getRouteDirections(
        currentLocation,
        {
          ...item.coords,
          name: item.title,
        },
        userHeading
      );

      fullRouteCoordsRef.current = result.coords;
      lastPassedIndexRef.current = 0;
      safeDetourStartTimeRef.current = null;
      setRouteCoordinates(result.coords);
      setRouteInfo(result);
      logger.route(
        `Lộ trình đã tải: ${result.summary} (${result.distanceText}, ${result.durationText}, ${result.coords.length} điểm)`
      );

      if (mapRef.current && result.coords.length > 0) {
        mapRef.current.fitToCoordinates(result.coords);
      }
    } catch (err) {
      Alert.alert('Không thể vẽ đường', err.message || 'Lỗi định tuyến đến địa điểm này.');
    } finally {
      setIsLoadingRoute(false);
    }
  };

  /**
   * Tìm kiếm lộ trình từ OpenStreetMap Routing thật
   */
  const handleFetchRoute = async () => {
    if (!currentLocation) {
      Alert.alert('Lỗi', 'Chưa xác định được vị trí hiện tại của bạn.');
      return;
    }

    if (!destinationInput.trim()) {
      Alert.alert(
        'Thiếu thông tin',
        'Vui lòng nhập tên địa chỉ hoặc chạm trực tiếp vào một điểm trên bản đồ.'
      );
      return;
    }

    setIsLoadingRoute(true);
    try {
      const result = await getRouteDirections(
        currentLocation,
        destinationInput.trim(),
        userHeading
      );
      fullRouteCoordsRef.current = result.coords;
      lastPassedIndexRef.current = 0;
      safeDetourStartTimeRef.current = null;
      setRouteCoordinates(result.coords);
      setRouteInfo(result);
      logger.route(
        `Lộ trình đã tải: ${result.summary} (${result.distanceText}, ${result.durationText}, ${result.coords.length} điểm)`
      );

      if (mapRef.current && result.coords.length > 0) {
        mapRef.current.fitToCoordinates(result.coords);
      }
    } catch (error) {
      Alert.alert('Không thể tạo lộ trình', error.message || 'Lỗi tìm kiếm tuyến đường.');
    } finally {
      setIsLoadingRoute(false);
    }
  };

  /**
   * Chạm trực tiếp lên bản đồ để chọn điểm đến và vẽ tuyến đường thật ngay lập tức
   */
  const handleMapPress = async (e) => {
    if (isTripActive) return; // Không thay đổi điểm đến khi chuyến đi đang diễn ra
    const coord = e.coordinate || e.nativeEvent?.coordinate;
    if (!coord) return;

    if (!currentLocation) {
      Alert.alert('Chờ GPS', 'Đang xác định vị trí hiện tại của bạn...');
      return;
    }

    setIsLoadingRoute(true);
    try {
      const result = await getRouteDirections(currentLocation, coord, userHeading);
      fullRouteCoordsRef.current = result.coords;
      lastPassedIndexRef.current = 0;
      safeDetourStartTimeRef.current = null;
      setRouteCoordinates(result.coords);
      setRouteInfo(result);
      logger.route(
        `Lộ trình đã tải: ${result.summary} (${result.distanceText}, ${result.durationText}, ${result.coords.length} điểm)`
      );
      setDestinationInput(result.destinationName);

      if (mapRef.current && result.coords.length > 0) {
        mapRef.current.fitToCoordinates(result.coords);
      }
    } catch (err) {
      Alert.alert('Không thể vẽ đường', err.message || 'Lỗi định tuyến đến điểm đã chọn.');
    } finally {
      setIsLoadingRoute(false);
    }
  };

  /**
   * Bắt đầu chuyến đi an toàn
   */
  const handleStartTrip = async () => {
    if (routeCoordinates.length < 2) {
      Alert.alert('Chưa có lộ trình', 'Vui lòng tìm và thiết lập điểm đến trước khi bắt đầu.');
      return;
    }

    try {
      await startBackgroundLocationTracking();
      setIsTripActive(true);
      setTripStatus('SAFE');
      setDeviationSeconds(0);
      lastPassedIndexRef.current = 0;
      safeDetourStartTimeRef.current = null;

      logger.info(`🛡️ Bắt đầu chuyến đi: ${routeInfo?.summary || 'Tuyến đã chọn'} (Đường kính an toàn: ${safetyDiameter}m)`);

      // Tính khoảng cách ban đầu
      if (currentLocation) {
        const initialDist = calculateCrossTrackDistance(currentLocation, routeCoordinates);
        setCrossTrackDistance(initialDist);
      }

      Alert.alert(
        'Đã kích hoạt bảo vệ',
        `Ứng dụng đang theo dõi lộ trình xe buýt của bạn với vùng an toàn đường kính ${safetyDiameter}m (bán kính ${safetyRadius}m). Nếu xe đi lệch nhẹ nhưng vẫn an toàn trong ${autoRerouteMinutes} phút, app sẽ tự động vẽ lại lộ trình mới.`
      );
    } catch (error) {
      Alert.alert('Lỗi chạy ngầm', 'Không thể khởi động theo dõi vị trí nền: ' + error.message);
    }
  };

  /**
   * Nút test giả lập chệch hướng để kiểm tra còi báo động ngay lập tức
   */
  const handleSimulateDeviation = () => {
    if (!isTripActive) {
      Alert.alert('Thông báo', 'Hãy bấm "BẮT ĐẦU CHUYẾN ĐI" trước khi thử nghiệm.');
      return;
    }
    const offsetDegrees = (safetyRadius + 150) / 111000;
    Alert.alert(
      'Mô phỏng chệch tuyến',
      `Đang dịch chuyển tọa độ GPS của bạn ra xa lộ trình ${safetyRadius + 150}m (vượt bán kính ${safetyRadius}m) để kích hoạt chế độ cảnh báo 15 giây và đẩy âm lượng lên 100%.`,
      [
        {
          text: 'OK',
          onPress: () => {
            if (currentLocation) {
              const fakeCoord = {
                latitude: currentLocation.latitude + offsetDegrees,
                longitude: currentLocation.longitude + offsetDegrees,
                heading: userHeading,
              };
              handleNewLocationUpdate(fakeCoord);
            }
          },
        },
      ]
    );
  };

  /**
   * Căn giữa bản đồ về vị trí hiện tại
   */
  const handleRecenter = () => {
    if (currentLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        zoom: 16,
      });
    }
  };

  /**
   * Xuất toàn bộ file nhật ký Logcat chi tiết (.txt)
   */
  const handleExportLog = async () => {
    setIsExportingLog(true);
    try {
      await logger.exportToFile();
    } catch (err) {
      Alert.alert('Lỗi xuất file log', err.message || 'Không thể tạo file log.');
    } finally {
      setIsExportingLog(false);
    }
  };

  // Xác định màu sắc và nội dung Thẻ trạng thái
  const getBadgeContent = () => {
    switch (tripStatus) {
      case 'SAFE':
        return {
          bg: '#10B981',
          text: '✓ Đúng tuyến đường an toàn',
          sub: `Độ lệch: ${formatDistance(crossTrackDistance)} (Đường kính an toàn: ${safetyDiameter}m)`,
        };
      case 'WARNING':
        const remaining = Math.max(0, CONFIG.DEVIATION_TIME_LIMIT_SECONDS - deviationSeconds);
        return {
          bg: '#F59E0B',
          text: `⚠️ Cảnh báo: Chệch tuyến! (${formatDistance(crossTrackDistance)})`,
          sub: `Báo động cực lớn sẽ hú sau: ${remaining} giây`,
        };
      case 'ALARM':
        return {
          bg: '#EF4444',
          text: '🚨 BÁO ĐỘNG NGUY HIỂM: ÂM LƯỢNG 100%!',
          sub: `Xe buýt đã chệch quá bán kính ${safetyRadius}m trong hơn 15s!`,
        };
      case 'IDLE':
      default:
        return {
          bg: '#6B7280',
          text: 'Sẵn sàng - Hãy nhập điểm đến',
          sub: `Vùng an toàn mặc định: ${safetyDiameter}m (Bán kính: ${safetyRadius}m)`,
        };
    }
  };

  const badge = getBadgeContent();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* 1. Bản đồ OpenStreetMap miễn phí tương tác cao (Leaflet WebView) */}
      <OpenStreetMapViewer
        ref={mapRef}
        style={styles.map}
        currentLocation={currentLocation}
        heading={userHeading}
        routeCoordinates={routeCoordinates}
        safetyRadius={safetyRadius}
        isTripActive={isTripActive}
        onPress={handleMapPress}
      />

      {/* 2. Thanh tìm kiếm & Thiết lập điểm đến (Top Bar) */}
      <View style={styles.topContainer}>
        <View style={styles.searchBox}>
          <TextInput
            style={styles.input}
            placeholder="Gõ địa chỉ hoặc chạm lên bản đồ..."
            placeholderTextColor="#9CA3AF"
            value={destinationInput}
            onChangeText={handleInputChange}
            editable={!isTripActive}
          />
          {destinationInput.length > 0 && !isTripActive && (
            <TouchableOpacity
              style={styles.clearInputButton}
              onPress={() => {
                setDestinationInput('');
                setSuggestions([]);
              }}
            >
              <Text style={styles.clearInputText}>✕</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.searchButton, isTripActive && styles.disabledButton]}
            onPress={handleFetchRoute}
            disabled={isTripActive || isLoadingRoute}
          >
            {isLoadingRoute ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.searchButtonText}>Tìm</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Danh sách gợi ý địa chỉ chính xác để chọn (Dropdown) */}
        {suggestions.length > 0 && !isTripActive && (
          <View style={styles.suggestionsContainer}>
            {suggestions.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.suggestionItem,
                  idx === suggestions.length - 1 && styles.suggestionItemLast,
                ]}
                onPress={() => handleSelectSuggestion(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.suggestionIcon}>📍</Text>
                <View style={styles.suggestionTextContainer}>
                  <View style={styles.suggestionHeaderRow}>
                    <Text style={styles.suggestionTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.distText ? (
                      <Text style={styles.suggestionDistBadge}>
                        {item.distText}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.suggestionSub} numberOfLines={1}>
                    {item.sub}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Gợi ý chạm lên bản đồ */}
        {!isTripActive && routeCoordinates.length === 0 && (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>
              👆 Mẹo: Gõ địa chỉ hoặc chạm trực tiếp 1 điểm trên bản đồ để vẽ lộ trình thật
            </Text>
          </View>
        )}

        {/* Thẻ hiển thị thông tin tóm tắt tuyến xe buýt */}
        {routeInfo && (
          <View style={styles.routeSummaryCard}>
            <Text style={styles.routeSummaryTitle}>🚌 {routeInfo.summary}</Text>
            <Text style={styles.routeSummaryDetail}>
              Quãng đường: {routeInfo.distanceText} • Dự kiến: {routeInfo.durationText}
            </Text>
          </View>
        )}

        {/* 3. Thẻ trạng thái nổi bật (Status Badge) */}
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={styles.statusBadgeText}>{badge.text}</Text>
          <Text style={styles.statusBadgeSubText}>{badge.sub}</Text>
        </View>
      </View>

      {/* 4. Nút Định vị lại vị trí hiện tại (Recenter Button) */}
      <TouchableOpacity style={styles.recenterButton} onPress={handleRecenter}>
        <Text style={styles.recenterIcon}>🎯</Text>
      </TouchableOpacity>

      {/* Nút Cài đặt (Bánh răng) tại vị trí của nút Log cũ */}
      <TouchableOpacity
        style={styles.settingsFloatingButton}
        onPress={() => setIsSettingsVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.settingsFloatingIcon}>⚙️</Text>
      </TouchableOpacity>

      {/* Nút mô phỏng chệch tuyến (Dành cho kiểm thử/Demo) */}
      {isTripActive && tripStatus !== 'ALARM' && (
        <TouchableOpacity style={styles.testButton} onPress={handleSimulateDeviation}>
          <Text style={styles.testButtonText}>⚡ Test Chệch Tuyến</Text>
        </TouchableOpacity>
      )}

      {/* 5. Khối điều khiển dưới đáy màn hình (Bottom Floating Action Controls) */}
      <View style={styles.bottomContainer}>
        {!isTripActive ? (
          <TouchableOpacity
            style={[
              styles.mainActionButton,
              styles.startTripButton,
              routeCoordinates.length === 0 && styles.disabledButton,
            ]}
            onPress={handleStartTrip}
            disabled={routeCoordinates.length === 0}
          >
            <Text style={styles.mainActionButtonText}>🛡️ BẮT ĐẦU CHUYẾN ĐI AN TOÀN</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.mainActionButton, styles.stopTripButton]}
            onPress={handleDismissAlarmAndEndTrip}
          >
            <Text style={styles.mainActionButtonText}>⏹️ KẾT THÚC CHUYẾN ĐI</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 6. MÀN HÌNH BÁO ĐỘNG KHẨN CẤP ĐỎ RỰC (Full Emergency Alert Overlay) */}
      {tripStatus === 'ALARM' && (
        <View style={styles.alarmOverlay}>
          <View style={styles.alarmCard}>
            <Text style={styles.alarmIcon}>🚨</Text>
            <Text style={styles.alarmTitle}>NGUY HIỂM: XE CHỆCH LỘ TRÌNH!</Text>
            <Text style={styles.alarmDescription}>
              Bạn đã di chuyển ra ngoài bán kính an toàn {safetyRadius}m (Độ lệch hiện tại: {formatDistance(crossTrackDistance)}) trong hơn {CONFIG.DEVIATION_TIME_LIMIT_SECONDS} giây!
            </Text>
            <Text style={styles.alarmSubWarning}>
              Âm lượng điện thoại đã tự động đẩy lên mức 100% tối đa và rung liên tục để đánh thức bạn.
            </Text>

            {/* Nút Tắt báo động cực lớn và dễ bấm */}
            <TouchableOpacity
              style={styles.dismissAlarmButton}
              onPress={handleDismissAlarmAndEndTrip}
              activeOpacity={0.8}
            >
              <Text style={styles.dismissAlarmButtonText}>🔕 TẮT BÁO ĐỘNG & KHÔI PHỤC ÂM LƯỢNG</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 7. Modal Cài đặt & Tiện ích (Độ rộng đường kính, Tự động vẽ lại đường, Xuất log) */}
      <SettingsModal
        visible={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
        safetyDiameter={safetyDiameter}
        onSafetyDiameterChange={(val) => {
          setSafetyDiameter(val);
          logger.info(`Đã thay đổi đường kính báo động: ${val}m (Bán kính bảo vệ: ${Math.round(val / 2)}m)`);
        }}
        autoRerouteMinutes={autoRerouteMinutes}
        onAutoRerouteMinutesChange={(val) => {
          setAutoRerouteMinutes(val);
          logger.info(`Đã đổi thời gian tự động vẽ lại đường: ${val} phút`);
        }}
        onManualRecalculate={() => recalculateRouteFromCurrentLocation(currentLocation)}
        onExportLog={handleExportLog}
        isExportingLog={isExportingLog}
        isTripActive={isTripActive}
        hasRoute={routeCoordinates.length > 1}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  topContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 40 : 50,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  searchBox: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: '#1F2937',
  },
  clearInputButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginRight: 4,
  },
  clearInputText: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  suggestionsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 6,
    maxHeight: 240,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionItemLast: {
    borderBottomWidth: 0,
  },
  suggestionIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  suggestionTextContainer: {
    flex: 1,
  },
  suggestionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestionDistBadge: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  suggestionSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  searchButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  hintBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    marginTop: 6,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  routeSummaryCard: {
    backgroundColor: '#EFF6FF',
    marginTop: 8,
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
  },
  routeSummaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E40AF',
  },
  routeSummaryDetail: {
    fontSize: 12,
    color: '#3B82F6',
    marginTop: 2,
  },
  statusBadge: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  statusBadgeSubText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  recenterButton: {
    position: 'absolute',
    right: 16,
    bottom: 110,
    backgroundColor: '#FFFFFF',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 9,
  },
  recenterIcon: {
    fontSize: 22,
  },
  settingsFloatingButton: {
    position: 'absolute',
    right: 16,
    bottom: 168,
    backgroundColor: '#FFFFFF',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 9,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  settingsFloatingIcon: {
    fontSize: 24,
  },
  testButton: {
    position: 'absolute',
    left: 16,
    bottom: 110,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
    zIndex: 9,
  },
  testButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  mainActionButton: {
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  startTripButton: {
    backgroundColor: '#10B981',
  },
  stopTripButton: {
    backgroundColor: '#DC2626',
  },
  mainActionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Toàn màn hình báo động khẩn cấp
  alarmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(185, 28, 28, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 999,
  },
  alarmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: width - 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  alarmIcon: {
    fontSize: 60,
    marginBottom: 10,
  },
  alarmTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 10,
  },
  alarmDescription: {
    fontSize: 15,
    color: '#1F2937',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
    fontWeight: '600',
  },
  alarmSubWarning: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  dismissAlarmButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#991B1B',
  },
  dismissAlarmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
});
