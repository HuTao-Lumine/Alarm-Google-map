# 🚌 BUS SAFETY ALARM - Ứng Dụng Giám Sát Hành Trình & Báo Động An Toàn Xe Buýt Học Đường

> **Hệ thống theo dõi thời gian thực chống ngủ quên, cảnh báo xe đi chệch tuyến đường an toàn và bảo vệ học sinh, sinh viên khi di chuyển bằng xe buýt.**

---

## 📖 1. LÝ DO RA ĐỜI & MỤC ĐÍCH PHÁT TRIỂN

### ⚠️ Bối cảnh thực tế:
* **Học sinh, sinh viên kiệt sức & ngủ quên:** Sau những giờ học tập căng thẳng hoặc dậy sớm đón xe, học sinh - sinh viên thường ngủ thiếp đi trên xe buýt. Khi ngủ quên, các bạn rất dễ đi quá trạm dừng, bị lạc đến những bến cuối xa lạ, vắng vẻ khi trời đã tối.
* **Nguy cơ xe buýt đi chệch lộ trình:** Đã có nhiều trường hợp xe đưa đón học sinh hoặc xe buýt đổi lộ trình đột ngột, tài xế rẽ vào các cung đường lạ, đường tắt nguy hiểm hoặc xảy ra các tình huống bất thường mà người ngồi trên xe không hay biết để kịp thời xử lý hay thông báo cho gia đình.
* **Sự an tâm của gia đình & nhà trường:** Phụ huynh luôn mong muốn có một giải pháp công nghệ đáng tin cậy, tự động chạy ngầm trên điện thoại của con em để chủ động cảnh báo khi có nguy hiểm mà không cần thao tác liên tục.

### 🎯 Mục đích của ứng dụng:
**Bus Safety Alarm** được thiết kế như một **"vệ sĩ số hành trình"**:
1. Giám sát liên tục vị trí thực tế của xe so với lộ trình xe buýt định sẵn (kể cả khi tắt màn hình điện thoại).
2. Khi xe đi chệch ra khỏi vùng an toàn quá **15 giây**, ứng dụng sẽ **tự động đẩy âm lượng điện thoại lên mức tối đa 100%**, kích hoạt còi báo động khẩn cấp và rung chuông liên tục để **đánh thức người dùng ngay lập tức** hoặc thu hút sự can thiệp của những người xung quanh.
3. Khi người dùng bấm tắt báo động, ứng dụng **tự động khôi phục âm lượng điện thoại về đúng mức ban đầu**.

---

## ✨ 2. CÁC TÍNH NĂNG CHI TIẾT

### 🗺️ 2.1. Bản đồ OpenStreetMap (OSM) Tương Tác Cao & Hoàn Toàn Miễn Phí
* Sử dụng bản đồ mã nguồn mở **OpenStreetMap** kết hợp thư viện **Leaflet.js** thông qua WebView tối ưu tĩnh.
* **Hoàn toàn độc lập, không phụ thuộc vào Google Maps API Key**: Không lo bị hết hạn ngạch (quota limit), không tốn chi phí duy trì, không bị lỗi màn hình trắng hay lỗi DEVELOPER_ERROR trên các thiết bị Android phát hành độc lập.

### 🧭 2.2. Con Trỏ Chỉ Hướng La Bàn (Heading Pointer) Mượt Mà
* Hiển thị vị trí người dùng bằng biểu tượng chấm tròn kèm **nón định hướng (Directional Cone Pointer)** màu xanh.
* Tích hợp cảm biến la bàn số (`Location.watchHeadingAsync`) kết hợp hướng di chuyển từ GPS.
* **Thuật toán triệt tiêu lỗi quay 360°**: Ứng dụng góc tích lũy `cumulativeHeading` với phép đo sai lệch góc cực tiểu $\Delta \theta \in [-180^\circ, +180^\circ]$:
  $$\Delta \theta = ((\theta_{\text{mới}} - \theta_{\text{hiện tại}} + 540) \pmod{360}) - 180$$
  Loại bỏ 100% hiện tượng con trỏ bị xoay tròn 360 độ khi xoay qua điểm mốc hướng Bắc ($0^\circ \leftrightarrow 360^\circ$).

### 🛣️ 2.3. Thuật Toán Cắt Ngắn Lộ Trình Động (Dynamic Polyline Trimming)
* **Khi di chuyển đúng tuyến ($\le$ Bán kính an toàn)**: Tuyến đường phía sau lưng sẽ được cắt ngắn dần theo thời gian thực tương tự như Google Maps, tạo cảm giác mượt mà và trực quan biết mình đã đi được bao xa.
* **Khi chệch ra xa (> Bán kính an toàn)**: Hệ thống **đóng băng ngay lập tức việc cắt đường**, giữ nguyên vẹn hình dáng lộ trình gốc để tránh làm méo mó hoặc sai lệch tính toán độ lệch.

### 🚦 2.4. Định Tuyến Thông Minh: Tôn Trọng Đường 1 Chiều & Luồng Xe
* Tích hợp công nghệ định tuyến **Valhalla Routing Engine** (FOSSGIS OpenStreetMap Germany) làm ưu tiên số 1:
  * Phân tích chặt chẽ biển báo cấm rẽ, dải phân cách cứng giữa đường và **các tuyến đường một chiều** (như hệ thống đường một chiều Trần Phú, Bạch Đằng, Phan Châu Trinh,... tại các đô thị lớn).
  * Truyền thông số hướng mũi xe (`heading_tolerance: 60`), đảm bảo khi vẽ lộ trình xuất phát, xe bắt buộc phải đi xuôi theo đúng làn đường quy định, không vẽ đâm ngược chiều hay quay đầu bất hợp pháp.
* Cơ chế dự phòng thông minh với máy chủ **FOSSGIS OSRM** và **OSRM Project** bật cờ `continue_straight=true` và `bearings`.

### 🔄 2.5. Tự Động Cập Nhật Đường Vẽ Khi Lệch An Toàn (Auto Re-routing)
* Trong thực tế, xe buýt có thể đi vào đường tránh, đường gom hoặc tránh chỗ tắc đường (vẫn nằm trong phạm vi an toàn cho phép $\le$ Bán kính bảo vệ).
* Nếu phát hiện xe đi lệch nhẹ so với tim đường ban đầu ($> 15\text{ m}$) nhưng vẫn duy trì an toàn liên tục trong khoảng **30 phút** (có thể tùy chỉnh 10p, 20p, 30p, 60p), hệ thống sẽ **tự động vẽ lại lộ trình mới tối ưu** từ vị trí hiện tại đến điểm đích.
* Có nút cập nhật thủ công ngay trong Cài đặt để kiểm tra tính năng bất kỳ lúc nào.

### ⚙️ 2.6. Menu Cài Đặt (Nút Bánh Răng) & Tùy Chọn Độ Rộng Đường Kính Báo Động
* Nút tròn hình Bánh răng (`⚙️`) được bố trí nổi trên bản đồ, khi chạm vào sẽ mở ra bảng điều khiển tiện ích:
  * **Chọn độ rộng vùng báo động (Đường kính an toàn)**:
    * Hiển thị trực quan song song cả **Đường kính** và **Bán kính bảo vệ** tương ứng (ví dụ: Đường kính 400m $\rightarrow$ Bán kính bảo vệ $\pm 200\text{ m}$).
    * Mốc chọn nhanh tiện lợi: `100m`, `200m`, `300m`, `400m (Mặc định)`, `500m`, `800m`, `1000m`.
    * Nút tăng/giảm tinh chỉnh: `[-] Giảm 50m` / `[+] Tăng 50m`.
    * Vòng tròn xanh biểu diễn vùng an toàn trên bản đồ tự động co giãn to/nhỏ tức thì theo thông số đã chọn.
  * **Tùy chỉnh thời gian tự động cập nhật lộ trình**: Lựa chọn 10 phút, 20 phút, 30 phút, 60 phút.
  * **Nút xuất file log**: Đặt tích hợp bên trong modal cài đặt.

### 🚨 2.7. Báo Động Khẩn Cấp & Tự Động Đẩy Âm Lượng Lên 100%
* Khi xe đi lệch ra ngoài bán kính an toàn:
  * Ứng dụng chuyển sang trạng thái cảnh báo màu cam và đếm ngược **15 giây**.
  * Nếu sau 15 giây xe không quay lại lộ trình, **BÁO ĐỘNG ĐỎ** được kích hoạt:
    * Lưu lại mức âm lượng hiện tại của máy.
    * Tự động điều chỉnh âm lượng đa phương tiện của điện thoại lên **100% tối đa**, chuyển chế độ chuông sang Normal (kể cả khi điện thoại đang để chế độ Im lặng / Rung).
    * Bật còi hú lặp lại liên tục và rung thiết bị theo nhịp điệu dồn dập.
* **Khôi phục âm lượng thông minh**: Khi người dùng nhấn nút *"🔕 TẮT BÁO ĐỘNG & KHÔI PHỤC ÂM LƯỢNG"* (hoặc xe quay lại tuyến an toàn), còi tắt ngay lập tức và **âm lượng máy được hoàn trả về chính xác mức cũ** trước khi báo động.

### 📋 2.8. Hệ Thống Ghi Log Chi Tiết & Xuất File Logcat (.txt)
* Logger tự động ghi lại toàn bộ hoạt động (GPS, tọa độ, sai số, góc quay la bàn, khoảng cách lệch tâm đường, tiến trình đếm giây, thay đổi âm lượng, tiến trình chạy ngầm).
* Nút **`📥 Xuất File Logcat Chi Tiết (.txt)`** tạo file `BusSafety_Logcat_<thời_gian>.txt` và mở menu hệ thống Android để lưu vào bộ nhớ trong máy, Google Drive hoặc chia sẻ qua Zalo/Email.

### 🔋 2.9. Chạy Ngầm Bền Bỉ (Background Location Tracking)
* Tích hợp Foreground Service với thông báo hệ thống liên tục trên thanh Notification.
* Tiếp tục nhận tọa độ GPS và tính toán khoảng cách chệch hướng ngay cả khi học sinh tắt màn hình điện thoại hoặc để trong ba lô.

---

## 🛠️ 3. CÔNG NGHỆ & THƯ VIỆN SỬ DỤNG

| Công nghệ / Thư viện | Phiên bản | Mục đích sử dụng |
| :--- | :--- | :--- |
| **React Native** | `0.88.0` | Nền tảng xây dựng ứng dụng di động đa nền tảng |
| **React** | `19.3.0` | Thư viện UI cốt lõi với Hooks (`useRef`, `useState`, `useEffect`) |
| **Expo SDK** | `^58.0.17` | Hệ sinh thái phát triển ứng dụng di động hiện đại |
| **Leaflet.js** | `1.9.4` | Thư viện bản đồ tương tác mã nguồn mở hiển thị OpenStreetMap |
| **react-native-webview** | `14.0.1` | Cầu nối nhúng bản đồ Leaflet mượt mà, giao tiếp 2 chiều qua postMessage |
| **@turf/turf** | `^7.2.0` | Thư viện tính toán không gian địa lý: đo khoảng cách vuông góc ngắn nhất từ điểm đến Polyline (`pointToLineDistance`) |
| **Valhalla Routing Engine** | *Cloud FOSSGIS* | Định tuyến giao thông xe buýt, phân tích đường 1 chiều, cấm quay đầu |
| **OSRM Engine** | *Cloud OSM.de* | Định tuyến dự phòng với cờ `continue_straight` và `bearings` |
| **Photon & Geocoding** | *API* | Tìm kiếm gợi ý địa chỉ tiếng Việt (Autocomplete) ưu tiên cự ly gần nhất |
| **@mapbox/polyline** | `^1.2.1` | Giải mã chuỗi Polyline nén độ chính xác cao (Precision 5 & 6) |
| **expo-location** | `~58.0.18` | Lấy tọa độ GPS độ chính xác cao và theo dõi cảm biến la bàn góc quay |
| **expo-task-manager** | `~58.0.12` | Định nghĩa Background Task chạy ngầm khi ứng dụng ở chế độ khóa màn hình |
| **react-native-volume-manager** | `^2.2.0` | Đọc mức âm lượng hệ thống, ép âm lượng lên 100% và khôi phục khi tắt |
| **expo-audio** | `~58.0.10` | Phát âm thanh còi báo động khẩn cấp lặp lại liên tục |
| **expo-file-system/legacy** | `~58.0.11` | Ghi file văn bản nhật ký logcat `.txt` lưu trữ cục bộ |
| **expo-sharing** | `~58.0.20` | Kích hoạt Action Sheet hệ thống để chọn nơi lưu file log hoặc chia sẻ |
| **expo-build-properties** | `~58.0.11` | Tối ưu cấu hình Android Proguard và loại trừ lỗi R8 WorkManager |

---

## 📂 4. CẤU TRÚC THƯ MỤC DỰ ÁN

```
GIT/
├── assets/                          # Icon ứng dụng, biểu tượng Adaptive Android
├── src/
│   ├── components/
│   │   ├── OpenStreetMapViewer.js   # Thành phần WebView Leaflet, nón chỉ hướng la bàn
│   │   └── SettingsModal.js         # Giao diện Cài đặt độ rộng đường kính & xuất log
│   ├── services/
│   │   ├── alarmService.js          # Dịch vụ âm thanh, rung & điều khiển âm lượng 100%
│   │   ├── directionsService.js     # Dịch vụ định tuyến Valhalla & OSRM đường 1 chiều
│   │   ├── locationService.js       # Dịch vụ theo dõi vị trí nền (Foreground Service)
│   │   └── loggerService.js         # Dịch vụ ghi log chi tiết và xuất file .txt
│   ├── utils/
│   │   └── geoUtils.js              # Thuật toán Turf.js đo độ lệch & cắt ngắn đường đi
│   └── config.js                    # Hằng số cấu hình (ngưỡng an toàn, thời gian đếm)
├── App.js                           # Màn hình chính & toàn bộ State điều khiển
├── app.json                         # Cấu hình quyền Android & Expo Plugin (đã xóa Project ID cá nhân)
├── index.js                         # Điểm khởi chạy Root của ứng dụng
├── package.json                     # Danh sách các gói thư viện phụ thuộc
├── package-lock.json                # Khóa phiên bản dependencies
├── .gitignore                       # Danh sách loại trừ các tệp tạm thời
└── README.md                        # Tài liệu hướng dẫn chi tiết dự án (file này)
```

---

## 🚀 5. HƯỚNG DẪN CÀI ĐẶT & SỬ DỤNG

### 📥 5.1. Khởi chạy thử nghiệm (Development):
1. Cài đặt các gói thư viện:
   ```bash
   npm install
   ```
2. Khởi động máy chủ phát triển Expo:
   ```bash
   npx expo start
   ```
3. Mở ứng dụng **Expo Go** trên điện thoại Android và quét mã QR để trải nghiệm trực tiếp.

### 📦 5.2. Đóng gói thành file APK độc lập:
1. Đăng nhập tài khoản Expo của bạn:
   ```bash
   npx eas-cli login
   ```
2. Khởi tạo cấu hình EAS Build cho dự án:
   ```bash
   npx eas-cli build:configure
   ```
3. Tiến hành đóng gói APK:
   ```bash
   npx eas-cli build --platform android --profile preview
   ```

---

## 📄 GIẤY PHÉP (LICENSE)
Dự án được phát triển phục vụ mục đích an toàn cộng đồng, giáo dục học đường và bảo vệ học sinh, sinh viên khi tham gia giao thông công cộng.
