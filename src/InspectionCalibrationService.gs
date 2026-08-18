/**
 * Kiểm định (15_KIEM_DINH) + Hiệu chuẩn (16_HIEU_CHUAN) — mục 4.4, 6.2 tài liệu thiết kế.
 * Gộp 1 file vì 2 nghiệp vụ có cấu trúc và luồng giống hệt nhau (tài liệu thiết kế cũng nhóm
 * "Maintenance / Inspection / Calibration.gs" chung 1 file).
 *
 * Quy tắc mục 6.2: nếu KET_QUA = "Không đạt" VÀ có cấu hình 27_CAU_HINH khớp loại thiết bị này với
 * BAT_BUOC = "Có" → tự chuyển thiết bị sang "Tạm ngừng sử dụng". KHÔNG có cấu hình khớp (mặc định
 * ban đầu, mục 14 tài liệu thiết kế) → KHÔNG tự chuyển trạng thái, hệ thống không tự suy diễn.
 */

var TECH_ASSURANCE_MODULE = 'Bảo hành/Bảo trì/Kiểm định/Hiệu chuẩn';

var INSPECTION_TYPE = { sheet: '15_KIEM_DINH', label: 'Kiểm định', donViField: 'DON_VI_KIEM_DINH', configRule: 'Kiểm định' };
var CALIBRATION_TYPE = { sheet: '16_HIEU_CHUAN', label: 'Hiệu chuẩn', donViField: 'DON_VI_HIEU_CHUAN', configRule: 'Hiệu chuẩn' };
var TECH_ASSURANCE_STATUSES = ['Không áp dụng', 'Chưa thực hiện', 'Đang chờ', 'Đạt', 'Không đạt', 'Quá hạn'];

var InspectionCalibration = {
  _resolveType_: function (typeKey) {
    var type = (typeKey === 'CALIBRATION') ? CALIBRATION_TYPE : (typeKey === 'INSPECTION') ? INSPECTION_TYPE : null;
    Utils.assert(type, ERROR_CODES.VALIDATION_ERROR, 'Loại nghiệp vụ không hợp lệ: ' + typeKey);
    return type;
  },

  listActiveDevices: function (token) {
    var auth = Auth.assertPermission(token, TECH_ASSURANCE_MODULE, 'VIEW');
    var all = Database.list('01_THIET_BI', {}).items.filter(function (d) { return d.TRANG_THAI_QUAN_LY !== DEVICE_STATUS.DA_THANH_LY; });
    all = Device._applyScopeFilter_(all, auth.scope);
    return all.map(function (d) { return { ID: d.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI }; });
  },

  listByDevice: function (token, typeKey, deviceId) {
    var type = this._resolveType_(typeKey);
    Auth.assertPermission(token, TECH_ASSURANCE_MODULE, 'VIEW');
    return Database.list(type.sheet, { filters: { THIET_BI_ID: deviceId } }).items
      .sort(function (a, b) { return new Date(b.NGAY_THUC_HIEN) - new Date(a.NGAY_THUC_HIEN); });
  },

  submitResult: function (token, typeKey, deviceId, data) {
    var type = this._resolveType_(typeKey);
    var auth = Auth.assertPermission(token, TECH_ASSURANCE_MODULE, 'CREATE');
    var device = Database.getById('01_THIET_BI', deviceId);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị.');
    Utils.assert(TECH_ASSURANCE_STATUSES.indexOf(data.TRANG_THAI) !== -1, ERROR_CODES.VALIDATION_ERROR, 'Trạng thái không hợp lệ.');

    var payload = {
      THIET_BI_ID: deviceId,
      CAN_CU_AP_DUNG: data.CAN_CU_AP_DUNG || '',
      NGAY_THUC_HIEN: data.NGAY_THUC_HIEN || '',
      TRANG_THAI: data.TRANG_THAI,
      NGAY_HET_HAN: data.NGAY_HET_HAN || '',
      GHI_CHU: data.GHI_CHU || ''
    };
    payload[type.donViField] = data.DON_VI || '';

    var result = Database.insertRow(type.sheet, payload, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'SUBMIT_' + typeKey, type.sheet, result.data.ID, null, result.data);

    if (data.TRANG_THAI === 'Không đạt') {
      var rule = Admin.findConfigRule_(device.LOAI_THIET_BI_ID, type.configRule);
      if (rule && rule.BAT_BUOC === 'Có' && device.TRANG_THAI_QUAN_LY !== DEVICE_STATUS.DA_THANH_LY) {
        var before = device.TRANG_THAI_QUAN_LY;
        Database.forceUpdateProtectedField_('01_THIET_BI', deviceId, { TRANG_THAI_QUAN_LY: DEVICE_STATUS.TAM_NGUNG_SU_DUNG }, auth.user.tenDangNhap);
        Database.appendAuditLog(auth.user.tenDangNhap, 'DEVICE_STATUS_CHANGE', '01_THIET_BI', deviceId,
          { TRANG_THAI_QUAN_LY: before }, { TRANG_THAI_QUAN_LY: DEVICE_STATUS.TAM_NGUNG_SU_DUNG, reason: type.label + ' không đạt, theo cấu hình bắt buộc' });
        result.data.deviceSuspended = true;
      }
    }
    return result.data;
  }
};
