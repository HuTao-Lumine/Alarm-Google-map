import { createAudioPlayer, AudioModule } from 'expo-audio';
import { Vibration } from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';
import { CONFIG } from '../config';
import { logger } from './loggerService';

class AlarmService {
  constructor() {
    this.player = null;
    this.isPlaying = false;
    this.originalVolume = null; // Lưu mức âm lượng ban đầu trước khi kích hoạt còi
  }

  /**
   * Thiết lập chế độ âm thanh ưu tiên phát lớn và chạy nền
   */
  async setupAudioMode() {
    try {
      if (AudioModule && AudioModule.setAudioModeAsync) {
        await AudioModule.setAudioModeAsync({
          playsInSilentMode: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      }
    } catch (error) {
      logger.warn('Lỗi khi cấu hình Audio Mode: ' + error.message);
    }
  }

  /**
   * Kích hoạt còi báo động khẩn cấp lớn:
   * 1. Lưu mức âm lượng hiện tại của điện thoại
   * 2. Tự động đưa âm lượng máy lên mức TỐI ĐA 100%
   * 3. Bật còi hú lặp lại liên tục và rung thiết bị
   */
  async startAlarm() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    logger.alarm('🚨 KÍCH HOẠT BÁO ĐỘNG KHẨN CẤP (Xe đi chệch tuyến > 15s)');

    try {
      // 1. Tự động điều chỉnh âm lượng thiết bị lên 100%
      try {
        const volResult = await VolumeManager.getVolume();
        const curVol =
          typeof volResult === 'object' && volResult.volume !== undefined
            ? volResult.volume
            : typeof volResult === 'number'
            ? volResult
            : 0.5;

        this.originalVolume = curVol;
        logger.volume(`Đã lưu âm lượng ban đầu của máy: ${Math.round(curVol * 100)}%`);

        // Đẩy âm lượng máy lên 100% (1.0)
        await VolumeManager.setVolume(1.0, { type: 'music', showUI: false });
        logger.volume('ĐÃ ĐẨY ÂM LƯỢNG MÁY LÊN MỨC TỐI ĐA (100%) ĐỂ ĐÁNH THỨC');

        // Chuyển chế độ chuông sang Normal nếu máy đang để Im lặng / Rung
        try {
          await VolumeManager.setRingerMode('normal');
        } catch (_) {}
      } catch (volErr) {
        logger.warn('Không thể điều khiển âm lượng hệ thống: ' + volErr.message);
      }

      // 2. Kích hoạt rung máy liên tục: Rung 1s, nghỉ 0.5s, lặp lại
      const VIBRATION_PATTERN = [1000, 500, 1000, 500];
      Vibration.vibrate(VIBRATION_PATTERN, true);

      // 3. Cấu hình âm thanh phát nền
      await this.setupAudioMode();

      // 4. Tạo Audio Player phát còi hú lặp lại
      if (this.player) {
        try {
          this.player.release();
        } catch (_) {}
      }

      this.player = createAudioPlayer({ uri: CONFIG.SIREN_AUDIO_URL });
      if (this.player) {
        this.player.loop = true;
        this.player.volume = 1.0;
        this.player.play();
        logger.alarm('Đang phát âm thanh còi báo động lặp lại');
      }
    } catch (error) {
      logger.error('Lỗi khi phát còi báo động chính: ' + error.message);
      try {
        if (!this.player) {
          this.player = createAudioPlayer({ uri: CONFIG.FALLBACK_SIREN_URL });
          if (this.player) {
            this.player.loop = true;
            this.player.volume = 1.0;
            this.player.play();
          }
        }
      } catch (fallbackError) {
        logger.error('Không thể phát âm thanh dự phòng: ' + fallbackError.message);
      }
    }
  }

  /**
   * Dừng còi báo động:
   * 1. Tắt âm thanh và dừng rung
   * 2. Tự động phục hồi âm lượng máy về mức ban đầu trước khi báo động
   */
  async stopAlarm() {
    this.isPlaying = false;
    logger.alarm('🔕 ĐÃ TẮT BÁO ĐỘNG');

    try {
      // 1. Tắt rung và âm thanh
      Vibration.cancel();
      if (this.player) {
        this.player.pause();
        this.player.release();
        this.player = null;
      }

      // 2. Phục hồi âm lượng ban đầu của máy
      if (this.originalVolume !== null && this.originalVolume !== undefined) {
        try {
          await VolumeManager.setVolume(this.originalVolume, { type: 'music', showUI: false });
          logger.volume(`ĐÃ KHÔI PHỤC ÂM LƯỢNG MÁY VỀ MỨC BAN ĐẦU: ${Math.round(this.originalVolume * 100)}%`);
          this.originalVolume = null;
        } catch (restoreErr) {
          logger.warn('Lỗi phục hồi âm lượng ban đầu: ' + restoreErr.message);
        }
      }
    } catch (error) {
      logger.error('Lỗi khi tắt âm thanh báo động: ' + error.message);
    }
  }
}

export const alarmService = new AlarmService();
