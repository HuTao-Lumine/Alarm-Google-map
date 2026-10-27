import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Dịch vụ Ghi Log Chi Tiết (Full Detailed Logger)
 * Ghi nhận toàn bộ hoạt động của ứng dụng tương tự logcat PID.
 * Hỗ trợ xuất trực tiếp ra file .txt để lưu trong máy hoặc chia sẻ.
 */
class LoggerService {
  constructor() {
    this.logs = [];
    this.maxLogs = 2000; // Lưu tối đa 2000 dòng log chi tiết
    this.listeners = new Set();
    this.startTime = new Date().toISOString();

    // Tự động ghi lại các console log/warn/error của hệ thống
    this.setupConsoleInterceptors();
  }

  setupConsoleInterceptors() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      originalLog(...args);
      try {
        const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        this.add('CONSOLE', msg);
      } catch (_) {}
    };

    console.warn = (...args) => {
      originalWarn(...args);
      try {
        const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        this.add('WARN', msg);
      } catch (_) {}
    };

    console.error = (...args) => {
      originalError(...args);
      try {
        const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        this.add('ERROR', msg);
      } catch (_) {}
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const copy = [...this.logs];
    for (const listener of this.listeners) {
      try {
        listener(copy);
      } catch (_) {}
    }
  }

  add(type, message, details = null) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(Math.floor(now.getMilliseconds() / 10)).padStart(2, '0')}`;

    const newLog = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      time: timeStr,
      iso: now.toISOString(),
      type, // 'GPS' | 'ROUTE' | 'DEVIATION' | 'ALARM' | 'VOLUME' | 'TASK' | 'INFO' | 'WARN' | 'ERROR' | 'CONSOLE'
      message,
      details,
    };

    this.logs.unshift(newLog);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    this.notify();
  }

  info(msg, details) { this.add('INFO', msg, details); }
  gps(msg, details) { this.add('GPS', msg, details); }
  route(msg, details) { this.add('ROUTE', msg, details); }
  deviation(msg, details) { this.add('DEVIATION', msg, details); }
  alarm(msg, details) { this.add('ALARM', msg, details); }
  volume(msg, details) { this.add('VOLUME', msg, details); }
  task(msg, details) { this.add('TASK', msg, details); }
  warn(msg, details) { this.add('WARN', msg, details); }
  error(msg, details) { this.add('ERROR', msg, details); }

  clear() {
    this.logs = [];
    this.notify();
  }

  /**
   * Tạo chuỗi văn bản hoàn chỉnh chứa toàn bộ nhật ký debug
   */
  getFullDetailedLogsAsText() {
    const header = [
      '========================================================================',
      '        NHẬT KÝ HOẠT ĐỘNG CHI TIẾT - BUS SAFETY ALARM (DEBUG LOGCAT)',
      '========================================================================',
      `Thời gian bắt đầu: ${this.startTime}`,
      `Thời gian xuất log: ${new Date().toISOString()}`,
      `Nền tảng thiết bị: ${Platform.OS} (Phiên bản: ${Platform.Version})`,
      `Tổng số dòng ghi nhận: ${this.logs.length}`,
      '========================================================================\n',
    ].join('\n');

    const logLines = this.logs
      .slice()
      .reverse()
      .map((l) => {
        let line = `[${l.time}] [${l.type.padEnd(9)}] ${l.message}`;
        if (l.details) {
          line += '\n  --> Chi tiết: ' + (typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details));
        }
        return line;
      })
      .join('\n');

    return `${header}\n${logLines}\n\n========================= HẾT NHẬT KÝ =========================\n`;
  }

  /**
   * Xuất log thành file .txt và mở bảng chia sẻ / lưu tệp trên điện thoại
   */
  async exportToFile() {
    try {
      const text = this.getFullDetailedLogsAsText();
      const now = new Date();
      const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const fileName = `BusSafety_Logcat_${datePart}.txt`;

      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, text, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      this.info(`Đã lưu file log cục bộ tại: ${fileName}`);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/plain',
          dialogTitle: 'Chọn nơi lưu file nhật ký Logcat (.txt)',
          UTI: 'public.plain-text',
        });
        return { success: true, fileName, fileUri };
      } else {
        return { success: false, message: 'Thiết bị không hỗ trợ chia sẻ file.' };
      }
    } catch (err) {
      this.error('Lỗi khi xuất file log: ' + err.message);
      throw err;
    }
  }
}

export const logger = new LoggerService();
