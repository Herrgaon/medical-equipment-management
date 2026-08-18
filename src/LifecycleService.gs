/**
 * Vòng đời hình thành thiết bị: Tiếp nhận → Nghiệm thu → Bàn giao (mục 6.1, 6.3 tài liệu thiết kế).
 * Đây là các hàm nghiệp vụ DUY NHẤT được phép chuyển TRANG_THAI_QUAN_LY qua các bước này — không có
 * đường nào khác ghi được field đó (Database.updateRowById tự chặn cứng, xem CLAUDE.md).
 *
 * Đơn giản hoá có chủ đích: mỗi bước tạo bản ghi = hoàn tất bước đó luôn (không tách "nháp" rồi
 * "hoàn tất" 2 lượt riêng) — cột TRANG_THAI trên từng sheet vẫn giữ để đúng schema thiết kế, nhưng
 * luôn ghi thẳng giá trị hoàn tất. Đây là lựa chọn UI, không phải quy tắc nghiệp vụ/pháp lý tự bịa.
 */

var LIFECYCLE_MODULE = 'Tiếp nhận/Nghiệm thu/Bàn giao';

var Lifecycle = {

  _getDeviceOrThrow_: function (deviceId) {
    var device = Database.getById('01_THIET_BI', deviceId);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị: ' + deviceId);
    return device;
  },

  _assertDeviceStatus_: function (device, expectedStatus) {
    Utils.assert(device.TRANG_THAI_QUAN_LY === expectedStatus, ERROR_CODES.VALIDATION_ERROR,
      'Thiết bị đang ở trạng thái "' + device.TRANG_THAI_QUAN_LY + '", không thể thực hiện bước này (cần "' + expectedStatus + '").');
  },

  _transitionDevice_: function (deviceId, newStatus, actor, patch) {
    var before = Database.getById('01_THIET_BI', deviceId);
    var fullPatch = Object.assign({ TRANG_THAI_QUAN_LY: newStatus }, patch || {});
    Database.forceUpdateProtectedField_('01_THIET_BI', deviceId, fullPatch, actor);
    Database.appendAuditLog(actor, 'DEVICE_STATUS_CHANGE', '01_THIET_BI', deviceId,
      { TRANG_THAI_QUAN_LY: before.TRANG_THAI_QUAN_LY }, { TRANG_THAI_QUAN_LY: newStatus });
  },

  // ---- Danh sách thiết bị đang chờ ở từng bước (để chọn xử lý) ----
  listDevicesAwaiting: function (token, stage) {
    var auth = Auth.assertPermission(token, LIFECYCLE_MODULE, 'VIEW');
    var statusByStage = { RECEIPT: DEVICE_STATUS.DANG_TIEP_NHAN, ACCEPTANCE: DEVICE_STATUS.CHO_NGHIEM_THU, HANDOVER_CREATE: DEVICE_STATUS.DA_NGHIEM_THU, HANDOVER_CONFIRM: DEVICE_STATUS.CHO_BAN_GIAO };
    var status = statusByStage[stage];
    Utils.assert(status, ERROR_CODES.VALIDATION_ERROR, 'Bước không hợp lệ: ' + stage);
    var all = Database.list('01_THIET_BI', { filters: { TRANG_THAI_QUAN_LY: status } }).items;
    all = Device._applyScopeFilter_(all, auth.scope);
    return all.map(function (d) { return { ID: d.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI }; });
  },

  // ---- Tiếp nhận ----
  submitReceipt: function (token, deviceId, data) {
    var auth = Auth.assertPermission(token, LIFECYCLE_MODULE, 'CREATE');
    var device = this._getDeviceOrThrow_(deviceId);
    this._assertDeviceStatus_(device, DEVICE_STATUS.DANG_TIEP_NHAN);
    Utils.assert(!Utils.isBlank(data.NGAY_TIEP_NHAN), ERROR_CODES.VALIDATION_ERROR, 'Thiếu ngày tiếp nhận.');

    var result = Database.insertRow('10_TIEP_NHAN', {
      THIET_BI_ID: deviceId,
      NGAY_TIEP_NHAN: data.NGAY_TIEP_NHAN,
      NGUON_HINH_THANH: data.NGUON_HINH_THANH || '',
      DON_VI_BAN_GIAO: data.DON_VI_BAN_GIAO || '',
      TINH_TRANG_KHI_NHAN: data.TINH_TRANG_KHI_NHAN || '',
      TRANG_THAI: 'Hoàn tất',
      GHI_CHU: data.GHI_CHU || ''
    }, auth.user.tenDangNhap);

    this._transitionDevice_(deviceId, DEVICE_STATUS.CHO_NGHIEM_THU, auth.user.tenDangNhap);
    return result.data;
  },

  // ---- Nghiệm thu ----
  submitAcceptance: function (token, deviceId, data) {
    var auth = Auth.assertPermission(token, LIFECYCLE_MODULE, 'CREATE');
    var device = this._getDeviceOrThrow_(deviceId);
    this._assertDeviceStatus_(device, DEVICE_STATUS.CHO_NGHIEM_THU);
    Utils.assert(!Utils.isBlank(data.NGAY_NGHIEM_THU), ERROR_CODES.VALIDATION_ERROR, 'Thiếu ngày nghiệm thu.');
    Utils.assert(['Đạt', 'Đạt có điều kiện', 'Không đạt'].indexOf(data.KET_QUA) !== -1, ERROR_CODES.VALIDATION_ERROR, 'Kết quả nghiệm thu không hợp lệ.');

    var result = Database.insertRow('11_NGHIEM_THU', {
      THIET_BI_ID: deviceId,
      NGAY_NGHIEM_THU: data.NGAY_NGHIEM_THU,
      HOI_DONG_NGHIEM_THU: data.HOI_DONG_NGHIEM_THU || '',
      KET_QUA: data.KET_QUA,
      TON_TAI_GHI_NHAN: data.TON_TAI_GHI_NHAN || '',
      GHI_CHU: data.GHI_CHU || ''
    }, auth.user.tenDangNhap);

    // Chỉ "Đạt"/"Đạt có điều kiện" mới chuyển tiếp — "Không đạt" giữ nguyên trạng thái, cần xử lý
    // thủ công tiếp theo (mục 6.1 không nêu quy tắc tự động cho trường hợp này, không tự suy diễn).
    if (data.KET_QUA === 'Đạt' || data.KET_QUA === 'Đạt có điều kiện') {
      this._transitionDevice_(deviceId, DEVICE_STATUS.DA_NGHIEM_THU, auth.user.tenDangNhap);
    }
    return result.data;
  },

  // ---- Bàn giao ----
  submitHandover: function (token, deviceId, data) {
    var auth = Auth.assertPermission(token, LIFECYCLE_MODULE, 'CREATE');
    var device = this._getDeviceOrThrow_(deviceId);
    this._assertDeviceStatus_(device, DEVICE_STATUS.DA_NGHIEM_THU);
    Utils.assert(!Utils.isBlank(data.NGAY_BAN_GIAO), ERROR_CODES.VALIDATION_ERROR, 'Thiếu ngày bàn giao.');
    Utils.assert(!Utils.isBlank(data.KHOA_PHONG_NHAN_ID), ERROR_CODES.VALIDATION_ERROR, 'Thiếu khoa/phòng nhận.');

    var result = Database.insertRow('12_BAN_GIAO', {
      THIET_BI_ID: deviceId,
      NGAY_BAN_GIAO: data.NGAY_BAN_GIAO,
      DON_VI_NHAN: data.DON_VI_NHAN || '',
      NGUOI_NHAN_ID: data.NGUOI_NHAN_ID || '',
      KHOA_PHONG_NHAN_ID: data.KHOA_PHONG_NHAN_ID,
      VI_TRI_NHAN_ID: data.VI_TRI_NHAN_ID || '',
      XAC_NHAN: 'Chưa xác nhận',
      GHI_CHU: data.GHI_CHU || ''
    }, auth.user.tenDangNhap);

    this._transitionDevice_(deviceId, DEVICE_STATUS.CHO_BAN_GIAO, auth.user.tenDangNhap);
    return result.data;
  },

  /** Khoa/phòng xác nhận đã nhận — kích hoạt thiết bị vào sử dụng, cập nhật khoa/phòng-vị trí hiện tại. */
  confirmHandover: function (token, handoverId) {
    var auth = Auth.assertPermission(token, LIFECYCLE_MODULE, 'APPROVE');
    var handover = Database.getById('12_BAN_GIAO', handoverId);
    Utils.assert(handover, ERROR_CODES.NOT_FOUND, 'Không tìm thấy phiếu bàn giao.');
    Utils.assert(handover.XAC_NHAN !== 'Đã xác nhận', ERROR_CODES.VALIDATION_ERROR, 'Phiếu này đã được xác nhận trước đó.');

    var device = this._getDeviceOrThrow_(handover.THIET_BI_ID);
    this._assertDeviceStatus_(device, DEVICE_STATUS.CHO_BAN_GIAO);

    Database.updateRowById('12_BAN_GIAO', handoverId, { XAC_NHAN: 'Đã xác nhận' }, auth.user.tenDangNhap);
    this._transitionDevice_(handover.THIET_BI_ID, DEVICE_STATUS.DANG_SU_DUNG, auth.user.tenDangNhap, {
      KHOA_PHONG_ID: handover.KHOA_PHONG_NHAN_ID,
      VI_TRI_ID: handover.VI_TRI_NHAN_ID || device.VI_TRI_ID
    });
    return { confirmed: true };
  },

  listPendingHandoverConfirm: function (token) {
    var auth = Auth.assertPermission(token, LIFECYCLE_MODULE, 'VIEW');
    var pending = Database.list('12_BAN_GIAO', { filters: { XAC_NHAN: 'Chưa xác nhận' } }).items;
    var deviceMap = {};
    Database.list('01_THIET_BI', {}).items.forEach(function (d) { deviceMap[d.ID] = d; });
    pending = pending.filter(function (h) { return deviceMap[h.THIET_BI_ID]; });
    if (auth.scope.type !== 'ALL') {
      pending = pending.filter(function (h) { return auth.scope.departmentIds.indexOf(h.KHOA_PHONG_NHAN_ID) !== -1; });
    }
    return pending.map(function (h) {
      var d = deviceMap[h.THIET_BI_ID];
      return { ID: h.ID, THIET_BI_ID: h.THIET_BI_ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI, NGAY_BAN_GIAO: h.NGAY_BAN_GIAO };
    });
  }
};
