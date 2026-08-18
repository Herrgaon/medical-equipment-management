/**
 * An toàn bức xạ (17_AN_TOAN_BUC_XA) + Hồ sơ phòng XQ/CT (18_HO_SO_PHONG_XQ_CT) — mục 4.5 tài liệu
 * thiết kế. Nhóm "điều kiện": chỉ áp dụng thiết bị liên quan bức xạ, AP_DUNG luôn có 3 trạng thái
 * Có/Không/Chưa xác định (mục 5 quy tắc chung), không tự suy diễn mặc định.
 * Gộp 1 file theo đúng nhóm "E. Chuyên biệt bức xạ" của tài liệu thiết kế (mục 0).
 * Log lịch sử theo thời gian (append-only), không có state machine tác động TRANG_THAI_QUAN_LY.
 */

var RADIATION_MODULE = 'Bức xạ / Phòng XQ-CT';
var RADIATION_AP_DUNG_VALUES = ['Có', 'Không', 'Chưa xác định'];

var Radiation = {

  listActiveDevices: function (token) {
    var auth = Auth.assertPermission(token, RADIATION_MODULE, 'VIEW');
    var all = Database.list('01_THIET_BI', {}).items.filter(function (d) { return d.TRANG_THAI_QUAN_LY !== DEVICE_STATUS.DA_THANH_LY; });
    all = Device._applyScopeFilter_(all, auth.scope);
    return all.map(function (d) { return { ID: d.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI }; });
  },

  // ---- 17_AN_TOAN_BUC_XA ----

  listSafetyByDevice: function (token, deviceId) {
    Auth.assertPermission(token, RADIATION_MODULE, 'VIEW');
    return Database.list('17_AN_TOAN_BUC_XA', { filters: { THIET_BI_ID: deviceId } }).items
      .sort(function (a, b) { return new Date(b.NGAY_CAP) - new Date(a.NGAY_CAP); });
  },

  submitSafety: function (token, deviceId, data) {
    var auth = Auth.assertPermission(token, RADIATION_MODULE, 'CREATE');
    var device = Database.getById('01_THIET_BI', deviceId);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị.');
    Utils.assert(RADIATION_AP_DUNG_VALUES.indexOf(data.AP_DUNG) !== -1, ERROR_CODES.VALIDATION_ERROR, 'Giá trị "Áp dụng" không hợp lệ.');

    var result = Database.insertRow('17_AN_TOAN_BUC_XA', {
      THIET_BI_ID: deviceId,
      AP_DUNG: data.AP_DUNG,
      SO_GIAY_PHEP: data.SO_GIAY_PHEP || '',
      CO_QUAN_CAP: data.CO_QUAN_CAP || '',
      NGAY_CAP: data.NGAY_CAP || '',
      THOI_HAN: data.THOI_HAN || '',
      GHI_CHU: data.GHI_CHU || ''
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'SUBMIT_RADIATION_SAFETY', '17_AN_TOAN_BUC_XA', result.data.ID, null, result.data);
    return result.data;
  },

  // ---- 18_HO_SO_PHONG_XQ_CT ----

  listXrayRoomByDevice: function (token, deviceId) {
    Auth.assertPermission(token, RADIATION_MODULE, 'VIEW');
    return Database.list('18_HO_SO_PHONG_XQ_CT', { filters: { THIET_BI_ID: deviceId } }).items
      .sort(function (a, b) { return new Date(b.NGAY_CAP) - new Date(a.NGAY_CAP); });
  },

  submitXrayRoom: function (token, deviceId, data) {
    var auth = Auth.assertPermission(token, RADIATION_MODULE, 'CREATE');
    var device = Database.getById('01_THIET_BI', deviceId);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị.');
    Utils.assert(!Utils.isBlank(data.TEN_PHONG), ERROR_CODES.VALIDATION_ERROR, 'Thiếu tên phòng.');

    var result = Database.insertRow('18_HO_SO_PHONG_XQ_CT', {
      THIET_BI_ID: deviceId,
      LOAI_PHONG: data.LOAI_PHONG || '',
      TEN_PHONG: data.TEN_PHONG,
      VI_TRI_ID: data.VI_TRI_ID || '',
      SO_GIAY_CHUNG_NHAN: data.SO_GIAY_CHUNG_NHAN || '',
      NGAY_CAP: data.NGAY_CAP || '',
      HIEU_LUC_DEN: data.HIEU_LUC_DEN || '',
      DON_VI_CAP: data.DON_VI_CAP || '',
      KET_QUA: data.KET_QUA || '',
      GHI_CHU: data.GHI_CHU || ''
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'SUBMIT_XRAY_ROOM_RECORD', '18_HO_SO_PHONG_XQ_CT', result.data.ID, null, result.data);
    return result.data;
  }
};
