import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

// Các mốc đường kính báo động cài đặt nhanh
const DIAMETER_PRESETS = [100, 200, 300, 400, 500, 800, 1000];

// Các mốc thời gian tự động cập nhật đường vẽ (phút)
const REROUTE_TIME_PRESETS = [10, 20, 30, 60];

export default function SettingsModal({
  visible,
  onClose,
  safetyDiameter = 400,
  onSafetyDiameterChange,
  autoRerouteMinutes = 30,
  onAutoRerouteMinutesChange,
  onManualRecalculate,
  onExportLog,
  isExportingLog = false,
  isTripActive = false,
  hasRoute = false,
}) {
  const safetyRadius = Math.round(safetyDiameter / 2);

  const handleDecrease = () => {
    if (safetyDiameter > 100) {
      onSafetyDiameterChange(Math.max(100, safetyDiameter - 50));
    }
  };

  const handleIncrease = () => {
    if (safetyDiameter < 3000) {
      onSafetyDiameterChange(safetyDiameter + 50);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerIcon}>⚙️</Text>
              <Text style={styles.headerTitle}>Cài đặt & Tiện ích</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* 1. CÀI ĐẶT ĐỘ RỘNG ĐƯỜNG KÍNH BÁO ĐỘNG */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>🛡️</Text>
                <Text style={styles.sectionTitle}>Độ Rộng Vùng Báo Động</Text>
              </View>

              <Text style={styles.sectionDesc}>
                Khi xe buýt di chuyển lệch ra ngoài bán kính an toàn quá 15 giây, còi báo động khẩn cấp và rung máy sẽ tự động kích hoạt.
              </Text>

              {/* Hiển thị số liệu trực quan */}
              <View style={styles.metricCard}>
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>ĐƯỜNG KÍNH VÙNG AN TOÀN</Text>
                  <Text style={styles.metricValue}>{safetyDiameter} m</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>BÁN KÍNH BẢO VỆ</Text>
                  <Text style={styles.metricRadiusValue}>±{safetyRadius} m</Text>
                </View>
              </View>

              {/* Nút tăng giảm tinh chỉnh (+/- 50m) */}
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepperBtn, safetyDiameter <= 100 && styles.stepperBtnDisabled]}
                  onPress={handleDecrease}
                  disabled={safetyDiameter <= 100}
                >
                  <Text style={styles.stepperBtnText}>- 50m</Text>
                </TouchableOpacity>

                <Text style={styles.stepperHint}>Đường kính: {safetyDiameter}m</Text>

                <TouchableOpacity
                  style={[styles.stepperBtn, safetyDiameter >= 3000 && styles.stepperBtnDisabled]}
                  onPress={handleIncrease}
                  disabled={safetyDiameter >= 3000}
                >
                  <Text style={styles.stepperBtnText}>+ 50m</Text>
                </TouchableOpacity>
              </View>

              {/* Các mốc chọn nhanh */}
              <Text style={styles.subLabel}>Hoặc chọn nhanh mức độ rộng:</Text>
              <View style={styles.presetPillsRow}>
                {DIAMETER_PRESETS.map((preset) => {
                  const isSelected = safetyDiameter === preset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[styles.pill, isSelected && styles.pillSelected]}
                      onPress={() => onSafetyDiameterChange(preset)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                        {preset}m
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 2. CÀI ĐẶT TỰ ĐỘNG CẬP NHẬT ĐƯỜNG VẼ */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>🔄</Text>
                <Text style={styles.sectionTitle}>Tự Động Cập Nhật Lộ Trình</Text>
              </View>

              <Text style={styles.sectionDesc}>
                Nếu bạn di chuyển lệch nhẹ khỏi tuyến đường cũ nhưng vẫn nằm trong phạm vi an toàn (≤ {safetyRadius}m), ứng dụng sẽ tự động tính toán lại đường vẽ mới từ vị trí hiện tại đến đích.
              </Text>

              <Text style={styles.subLabel}>Thời gian kích hoạt tự động vẽ lại:</Text>
              <View style={styles.presetPillsRow}>
                {REROUTE_TIME_PRESETS.map((minutes) => {
                  const isSelected = autoRerouteMinutes === minutes;
                  return (
                    <TouchableOpacity
                      key={minutes}
                      style={[styles.pill, isSelected && styles.pillSelected]}
                      onPress={() => onAutoRerouteMinutesChange(minutes)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                        {minutes} phút {minutes === 30 ? '(Chuẩn)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Nút kiểm tra/cập nhật lộ trình thủ công ngay */}
              {hasRoute && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rerouteBtn]}
                  onPress={() => {
                    onManualRecalculate?.();
                    onClose();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionBtnText}>
                    🔄 Cập nhật đường vẽ mới ngay từ vị trí này
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 3. NHẬT KÝ HỆ THỐNG (DEBUG LOG) */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>📥</Text>
                <Text style={styles.sectionTitle}>Nhật Ký Hoạt Động (Logcat)</Text>
              </View>

              <Text style={styles.sectionDesc}>
                Ghi nhận chi tiết từng tọa độ GPS, la bàn, tiến trình cắt lộ trình, đo độ lệch và trạng thái còi báo động tương tự logcat.
              </Text>

              {/* Nút xuất file log được đưa vào trong UI Cài đặt này theo yêu cầu */}
              <TouchableOpacity
                style={[styles.actionBtn, styles.exportLogBtn]}
                onPress={onExportLog}
                disabled={isExportingLog}
                activeOpacity={0.8}
              >
                {isExportingLog ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.actionBtnText}>
                    📥 Xuất File Logcat Chi Tiết (.txt)
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Footer nút Đóng */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.doneBtnText}>Hoàn Tất & Lưu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 22,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: 'bold',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  sectionDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
  },
  metricCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1E40AF',
  },
  metricRadiusValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2563EB',
  },
  metricDivider: {
    width: 1,
    height: '75%',
    backgroundColor: '#BFDBFE',
    marginHorizontal: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  stepperBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  stepperHint: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  presetPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 4,
  },
  pillSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },
  actionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  rerouteBtn: {
    backgroundColor: '#3B82F6',
  },
  exportLogBtn: {
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  doneBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
