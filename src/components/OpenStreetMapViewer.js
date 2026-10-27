import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { logger } from '../services/loggerService';

/**
 * Bản đồ tương tác OpenStreetMap (Leaflet.js)
 * Tích hợp con trỏ điều hướng hiển thị góc quay/hướng di chuyển của người dùng theo la bàn và GPS
 * KHÔNG CẦN BẤT KỲ GOOGLE MAPS API KEY NÀO.
 */
const STATIC_MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
  <script>
    if (typeof L === 'undefined') {
      document.write('<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js"><\\/script>');
    }
  </script>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: #E5E7EB;
      overflow: hidden;
    }
    #map {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: 100%;
      background-color: #E5E7EB;
    }
    
    /* Con trỏ người dùng kèm mũi tên chỉ hướng quay (Heading Pointer) */
    .user-marker-container {
      position: relative;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.18s cubic-bezier(0.2, 0, 0.2, 1);
      transform-origin: 22px 22px;
    }
    .user-heading-cone {
      position: absolute;
      top: 0px;
      width: 0;
      height: 0;
      border-left: 10px solid transparent;
      border-right: 10px solid transparent;
      border-bottom: 18px solid #2563EB;
      filter: drop-shadow(0 0 3px rgba(37, 99, 235, 0.7));
    }
    .user-marker-dot {
      position: absolute;
      width: 22px;
      height: 22px;
      background: #2563EB;
      border: 3.5px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    .dest-marker {
      font-size: 32px;
      line-height: 32px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    function sendLog(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOG', message: msg }));
      }
    }

    try {
      var map = L.map('map', {
        zoomControl: false,
        attributionControl: false
      }).setView([10.7769, 106.7009], 15);
      window.map = map;

      // Lớp bản đồ OpenStreetMap
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c']
      }).addTo(map);

      var userMarker = null;
      var userCircle = null;
      var routePolyline = null;
      var startMarker = null;
      var endMarker = null;
      var hasCenteredOnUser = false;
      var cumulativeHeading = 0;
      var hasSetInitialHeading = false;

      var userIcon = L.divIcon({
        className: 'user-leaflet-icon',
        html: '<div id="user-puck" class="user-marker-container"><div class="user-heading-cone"></div><div class="user-marker-dot"></div></div>',
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      // Cập nhật vị trí người dùng, hướng quay & bán kính an toàn
      window.updateUserLocation = function(lat, lon, radius, isTripActive, heading) {
        if (!lat || !lon) return;

        if (typeof heading === 'number' && !isNaN(heading) && heading >= 0) {
          if (!hasSetInitialHeading) {
            cumulativeHeading = heading;
            hasSetInitialHeading = true;
          } else {
            // Tính khoảng cách góc ngắn nhất từ -180 đến +180 độ
            // Triệt tiêu hoàn toàn lỗi xoay lộn 360 độ khi xoay qua điểm 0/360 độ (hướng Bắc)
            var currentMod = ((cumulativeHeading % 360) + 360) % 360;
            var diff = ((heading - currentMod + 540) % 360) - 180;
            cumulativeHeading += diff;
          }
        }

        if (!userMarker) {
          userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(map);
        } else {
          userMarker.setLatLng([lat, lon]);
        }

        // Cập nhật góc quay của con trỏ chỉ hướng (mượt mà, không xoay tròn 360 độ)
        var puckEl = document.getElementById('user-puck');
        if (puckEl) {
          puckEl.style.transform = 'rotate(' + cumulativeHeading + 'deg)';
        }

        // Tự động căn giữa vị trí người dùng lần đầu
        if (!hasCenteredOnUser && !routePolyline) {
          hasCenteredOnUser = true;
          map.setView([lat, lon], 15);
        }

        if (isTripActive && radius > 0) {
          if (!userCircle) {
            userCircle = L.circle([lat, lon], {
              radius: radius,
              color: '#2563EB',
              fillColor: '#3B82F6',
              fillOpacity: 0.15,
              weight: 1.5
            }).addTo(map);
          } else {
            userCircle.setLatLng([lat, lon]);
            userCircle.setRadius(radius);
          }
        } else {
          if (userCircle) {
            map.removeLayer(userCircle);
            userCircle = null;
          }
        }
      };

      // Vẽ hoặc cập nhật tuyến đường Polyline
      window.updateRoute = function(coords, shouldFitBounds) {
        if (!coords || coords.length < 2) {
          window.clearRoute();
          return;
        }

        // Nếu đã có Polyline thì chỉ cập nhật danh sách tọa độ (vẽ ngắn lại mượt mà)
        if (routePolyline) {
          routePolyline.setLatLngs(coords);
        } else {
          routePolyline = L.polyline(coords, {
            color: '#2563EB',
            weight: 6,
            opacity: 0.9,
            lineJoin: 'round'
          }).addTo(map);
        }

        // Cập nhật ghim điểm đến
        if (!endMarker) {
          var destIcon = L.divIcon({
            className: 'dest-marker',
            html: '📍',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          });
          endMarker = L.marker(coords[coords.length - 1], { icon: destIcon }).addTo(map);
        } else {
          endMarker.setLatLng(coords[coords.length - 1]);
        }

        // Chỉ fitBounds khi có yêu cầu (lần đầu tạo tuyến), tránh làm giật bản đồ khi đang đi
        if (shouldFitBounds && routePolyline) {
          map.fitBounds(routePolyline.getBounds(), { padding: [60, 60] });
        }
      };

      // Xóa tuyến đường
      window.clearRoute = function() {
        if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }
        if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
        if (endMarker) { map.removeLayer(endMarker); endMarker = null; }
      };

      // Bắt sự kiện chạm lên bản đồ
      map.on('click', function(e) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'MAP_CLICK',
            coordinate: {
              latitude: e.latlng.lat,
              longitude: e.latlng.lng
            }
          }));
        }
      });

      // Báo cho React Native biết bản đồ đã sẵn sàng
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
      }
      sendLog('Bản đồ OpenStreetMap đã khởi tạo thành công.');
    } catch (e) {
      sendLog('Lỗi JS bản đồ: ' + e.message);
    }
  </script>
</body>
</html>
`;

// Hằng số Source tĩnh - Giữ WebView không bao giờ bị reload
const STATIC_MAP_SOURCE = {
  html: STATIC_MAP_HTML,
  baseUrl: 'https://cdnjs.cloudflare.com',
};

const OpenStreetMapViewer = forwardRef(
  (
    {
      currentLocation,
      heading = 0,
      routeCoordinates = [],
      safetyRadius = 200,
      isTripActive = false,
      onPress,
      style,
    },
    ref
  ) => {
    const webViewRef = useRef(null);
    const isMapReadyRef = useRef(false);

    const latestLocationRef = useRef(currentLocation);
    latestLocationRef.current = currentLocation;

    const latestHeadingRef = useRef(heading);
    latestHeadingRef.current = heading;

    const latestRouteRef = useRef(routeCoordinates);
    latestRouteRef.current = routeCoordinates;

    useImperativeHandle(ref, () => ({
      animateToRegion: ({ latitude, longitude, zoom = 15 }) => {
        if (isMapReadyRef.current) {
          const js = `if (window.map) { window.map.setView([${latitude}, ${longitude}], ${zoom}, { animate: true }); } true;`;
          webViewRef.current?.injectJavaScript(js);
        }
      },
      fitToCoordinates: (coords) => {
        if (!coords || coords.length === 0 || !isMapReadyRef.current) return;
        const bounds = JSON.stringify(coords.map((c) => [c.latitude, c.longitude]));
        const js = `if (window.map && window.L) { window.map.fitBounds(${bounds}, { padding: [60, 60] }); } true;`;
        webViewRef.current?.injectJavaScript(js);
      },
    }));

    // Cập nhật vị trí GPS & hướng quay (Heading)
    useEffect(() => {
      if (currentLocation && isMapReadyRef.current) {
        const headVal = typeof heading === 'number' ? heading : 0;
        const js = `if (window.updateUserLocation) { window.updateUserLocation(${currentLocation.latitude}, ${currentLocation.longitude}, ${safetyRadius}, ${isTripActive ? 'true' : 'false'}, ${headVal}); } true;`;
        webViewRef.current?.injectJavaScript(js);
      }
    }, [currentLocation, heading, safetyRadius, isTripActive]);

    // Cập nhật tuyến đường còn lại (vẽ ngắn lại)
    useEffect(() => {
      if (isMapReadyRef.current) {
        if (routeCoordinates && routeCoordinates.length > 0) {
          const polylineCoords = JSON.stringify(
            routeCoordinates.map((c) => [c.latitude, c.longitude])
          );
          const js = `if (window.updateRoute) { window.updateRoute(${polylineCoords}, false); } true;`;
          webViewRef.current?.injectJavaScript(js);
        } else {
          const js = `if (window.clearRoute) { window.clearRoute(); } true;`;
          webViewRef.current?.injectJavaScript(js);
        }
      }
    }, [routeCoordinates]);

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'MAP_READY') {
          isMapReadyRef.current = true;
          logger.info('Bản đồ OSM đã sẵn sàng nhận dữ liệu vị trí và tuyến đường');

          // Nạp vị trí người dùng ban đầu nếu đã có
          if (latestLocationRef.current) {
            const loc = latestLocationRef.current;
            const headVal = typeof latestHeadingRef.current === 'number' ? latestHeadingRef.current : 0;
            const jsLoc = `if (window.updateUserLocation) { window.updateUserLocation(${loc.latitude}, ${loc.longitude}, ${safetyRadius}, ${isTripActive ? 'true' : 'false'}, ${headVal}); } true;`;
            webViewRef.current?.injectJavaScript(jsLoc);
          }

          // Nạp tuyến đường ban đầu nếu đã có
          if (latestRouteRef.current && latestRouteRef.current.length > 0) {
            const polylineCoords = JSON.stringify(
              latestRouteRef.current.map((c) => [c.latitude, c.longitude])
            );
            const jsRoute = `if (window.updateRoute) { window.updateRoute(${polylineCoords}, true); } true;`;
            webViewRef.current?.injectJavaScript(jsRoute);
          }
        } else if (data.type === 'MAP_CLICK' && onPress) {
          onPress({ nativeEvent: { coordinate: data.coordinate } });
        } else if (data.type === 'LOG') {
          logger.info(`[Map HTML] ${data.message}`);
        }
      } catch (err) {
        console.warn('Lỗi đọc message từ WebView map:', err);
      }
    };

    return (
      <View style={[styles.container, style]}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={STATIC_MAP_SOURCE}
          style={styles.webview}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scrollEnabled={false}
          bounces={false}
          mixedContentMode="always"
          androidHardwareAccelerationDisabled={false}
          onLoadEnd={() => logger.info('WebView bản đồ đã tải xong (LoadEnd)')}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            logger.error('Lỗi nạp WebView bản đồ: ' + nativeEvent.description);
          }}
        />
      </View>
    );
  }
);

export default OpenStreetMapViewer;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E5E7EB',
  },
  webview: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
});
