/**
 * Bảo hành (13_BAO_HANH, mục 4.4 tài liệu thiết kế) — nhật ký từng lần yêu cầu bảo hành/thu máy
 * xử lý, tách biệt với NGAY_BAT_DAU_BAO_HANH/NGAY_HET_BAO_HANH lưu trên 01_THIET_BI (đó là hạn
 * bảo hành tổng của thiết bị; đây là log từng lần thực tế gọi bảo hành trong thời hạn đó).
 * Không đụng TRANG_THAI_QUAN_LY của thiết bị — mục 6.1 không quy định bảo hành tác động trạng thái.
 */

var WARRANTY_MODULE = 'Bảo hành/Bảo trì/Kiểm định/Hiệu chuẩn';

var Warranty = {

  listByDevice: function (token, deviceId) {
    Auth.assertPermission(token, WARRANTY_MODULE, 'VIEW');
    return Database.list('13_BAO_HANH', { filters: { THIET_BI_ID: deviceId } }).items
      .sort(function (a, b) { return new Date(b.NGAY_BAT_DAU) - new Date(a.NGAY_BAT_DAU); });
  },

  createClaim: function (token, deviceId, data) {
    var auth = Auth.assertPermission(token, WARRANTY_MODULE, 'CREATE');
    var device = Database.getById('01_THIET_BI', deviceId);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị.');
    Utils.assert(!Utils.isBlank(data.NGAY_BAT_DAU), ERROR_CODES.VALIDATION_ERROR, 'Thiếu ngày bắt đầu.');

    var result = Database.insertRow('13_BAO_HANH', {
      THIET_BI_ID: deviceId,
      NGAY_BAT_DAU: data.NGAY_BAT_DAU,
      NGAY_KET_THUC: data.NGAY_KET_THUC || '',
      DON_VI_BAO_HANH: data.DON_VI_BAO_HANH || '',
      DIEU_KIEN_PHAM_VI: data.DIEU_KIEN_PHAM_VI || '',
      LAN_YEU_CAU_THU_MAY: data.LAN_YEU_CAU_THU_MAY || 0,
      KET_QUA_XU_LY: data.KET_QUA_XU_LY || '',
      GHI_CHU: data.GHI_CHU || ''
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CREATE_WARRANTY_CLAIM', '13_BAO_HANH', result.data.ID, null, result.data);
    return result.data;
  },

  updateClaim: function (token, id, data) {
    var auth = Auth.assertPermission(token, WARRANTY_MODULE, 'EDIT');
    var patch = {};
    ['NGAY_BAT_DAU', 'NGAY_KET_THUC', 'DON_VI_BAO_HANH', 'DIEU_KIEN_PHAM_VI', 'LAN_YEU_CAU_THU_MAY', 'KET_QUA_XU_LY', 'GHI_CHU'].forEach(function (f) {
      if (data.hasOwnProperty(f)) patch[f] = data[f];
    });
    var result = Database.updateRowById('13_BAO_HANH', id, patch, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'UPDATE_WARRANTY_CLAIM', '13_BAO_HANH', id, null, patch);
    return result.data;
  },

  /** Thiết bị còn hạn bảo hành (đọc từ 01_THIET_BI) — dùng cho danh sách chọn ở trang Bảo hành. */
  listActiveDevices: function (token) {
    var auth = Auth.assertPermission(token, WARRANTY_MODULE, 'VIEW');
    var all = Database.list('01_THIET_BI', {}).items.filter(function (d) { return d.TRANG_THAI_QUAN_LY !== DEVICE_STATUS.DA_THANH_LY; });
    all = Device._applyScopeFilter_(all, auth.scope);
    return all.map(function (d) {
      return { ID: d.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI, NGAY_HET_BAO_HANH: d.NGAY_HET_BAO_HANH };
    });
  }
};
