/**
 * Vòng đời & hồ sơ thiết bị (Sprint 1.2 — chỉ CRUD + trạng thái khởi tạo). Chuyển trạng thái qua
 * state machine đầy đủ (mục 6.1 tài liệu thiết kế) gắn liền với Receipt/Acceptance/Handover —
 * các module đó thuộc Giai đoạn 2, chưa xây — nên KHÔNG có changeDeviceStatus() ở đây, tránh xây
 * cơ chế trước khi có nghiệp vụ thật gọi tới.
 */

var DEVICE_MODULE = 'Thiết bị & hồ sơ';
var DEVICE_REQUIRED_FIELDS = ['TEN_THIET_BI', 'NHOM_THIET_BI_ID', 'KHOA_PHONG_ID', 'VI_TRI_ID', 'NGUOI_PHU_TRACH_ID', 'NGAY_DUA_VAO_SU_DUNG'];

var Device = {

  _assertRequiredFields_: function (data) {
    for (var i = 0; i < DEVICE_REQUIRED_FIELDS.length; i++) {
      var field = DEVICE_REQUIRED_FIELDS[i];
      Utils.assert(!Utils.isBlank(data[field]), ERROR_CODES.VALIDATION_ERROR, 'Thiếu trường bắt buộc: ' + field);
    }
  },

  _assertSerialNotDuplicate_: function (serial, excludeId) {
    if (Utils.isBlank(serial)) return;
    var existing = Database.list('01_THIET_BI', { filters: { SERIAL: serial } }).items;
    var conflict = existing.some(function (row) { return row.ID !== excludeId; });
    Utils.assert(!conflict, ERROR_CODES.DUPLICATE, 'Số serial "' + serial + '" đã tồn tại trong hệ thống.');
  },

  /**
   * Phạm vi theo khoa/phòng (mục 5 tài liệu thiết kế: "Khoa/phòng" chỉ thấy đơn vị mình).
   * scope.type === 'ALL' (Super Admin/Lãnh đạo/rỗng KHOA_PHONG_PHU_TRACH) -> không lọc.
   */
  _applyScopeFilter_: function (items, scope) {
    if (scope.type === 'ALL') return items;
    var allowed = {};
    scope.departmentIds.forEach(function (id) { allowed[id] = true; });
    return items.filter(function (row) { return allowed[row.KHOA_PHONG_ID]; });
  },

  createDevice: function (token, data) {
    var auth = Auth.assertPermission(token, DEVICE_MODULE, 'CREATE');
    this._assertRequiredFields_(data);
    this._assertSerialNotDuplicate_(data.SERIAL, null);

    // _generateDeviceCode_ tự nó KHÔNG giữ khoá (như _generateId_) — phải tự bọc _withLock_ ở đây,
    // nếu không hai lệnh tạo thiết bị đồng thời có thể đọc cùng 1 giá trị bộ đếm và sinh trùng mã.
    var maThietBi = Database._withLock_(function () { return Database._generateDeviceCode_(); });
    var payload = {
      MA_THIET_BI: maThietBi,
      TEN_THIET_BI: data.TEN_THIET_BI,
      LOAI_THIET_BI_ID: data.LOAI_THIET_BI_ID || '',
      NHA_CUNG_CAP_ID: data.NHA_CUNG_CAP_ID || '',
      PHAN_LOAI: data.PHAN_LOAI || '',
      NHOM_THIET_BI_ID: data.NHOM_THIET_BI_ID,
      HANG_SAN_XUAT_ID: data.HANG_SAN_XUAT_ID || '',
      NUOC_SAN_XUAT: data.NUOC_SAN_XUAT || '',
      NAM_SAN_XUAT: data.NAM_SAN_XUAT || '',
      MODEL: data.MODEL || '',
      SERIAL: data.SERIAL || '',
      KHOA_PHONG_ID: data.KHOA_PHONG_ID,
      VI_TRI_ID: data.VI_TRI_ID,
      NGUOI_PHU_TRACH_ID: data.NGUOI_PHU_TRACH_ID,
      TINH_TRANG_KY_THUAT: data.TINH_TRANG_KY_THUAT || 'Chưa xác định',
      // Trạng thái khởi tạo duy nhất hợp lệ khi tạo mới — KHÔNG nhận TRANG_THAI_QUAN_LY tự do từ
      // client dù đây là insertRow (chưa qua updateRowById nên PROTECTED_FIELDS chưa chặn được);
      // payload không đọc data.TRANG_THAI_QUAN_LY ở đâu cả, luôn ép cứng giá trị này.
      TRANG_THAI_QUAN_LY: DEVICE_STATUS.DANG_TIEP_NHAN,
      NGAY_DUA_VAO_SU_DUNG: data.NGAY_DUA_VAO_SU_DUNG,
      HINH_THUC_MUA_SAM: data.HINH_THUC_MUA_SAM || '',
      NGAY_BAT_DAU_BAO_HANH: data.NGAY_BAT_DAU_BAO_HANH || '',
      NGAY_HET_BAO_HANH: data.NGAY_HET_BAO_HANH || '',
      QR_URL: '',
      FOLDER_ID: '' // Document.gs (Sprint 1.3) sẽ tạo thư mục Drive riêng và cập nhật lại field này
    };

    var result = Database.insertRow('01_THIET_BI', payload, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CREATE_DEVICE', '01_THIET_BI', result.data.ID, null, result.data);
    return result.data;
  },

  updateDevice: function (token, id, data) {
    var auth = Auth.assertPermission(token, DEVICE_MODULE, 'EDIT');
    var existing = Database.getById('01_THIET_BI', id);
    Utils.assert(existing, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị: ' + id);

    if (auth.scope.type !== 'ALL') {
      Utils.assert(auth.scope.departmentIds.indexOf(existing.KHOA_PHONG_ID) !== -1,
        ERROR_CODES.PERMISSION_DENIED, 'Không có quyền sửa thiết bị ngoài phạm vi khoa/phòng được giao.');
    }
    if (data.hasOwnProperty('SERIAL')) this._assertSerialNotDuplicate_(data.SERIAL, id);

    // patch chỉ chứa field nghiệp vụ thường — TRANG_THAI_QUAN_LY bị Database.updateRowById tự
    // chặn cứng (PROTECTED_FIELDS) dù client có cố gửi lên cũng bị từ chối, không cần lọc tay ở đây.
    var result = Database.updateRowById('01_THIET_BI', id, data, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'UPDATE_DEVICE', '01_THIET_BI', id, existing, data);
    return result.data;
  },

  getDeviceDetail: function (token, id) {
    var auth = Auth.assertPermission(token, DEVICE_MODULE, 'VIEW');
    var device = Database.getById('01_THIET_BI', id);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị: ' + id);
    if (auth.scope.type !== 'ALL') {
      Utils.assert(auth.scope.departmentIds.indexOf(device.KHOA_PHONG_ID) !== -1,
        ERROR_CODES.PERMISSION_DENIED, 'Không có quyền xem thiết bị ngoài phạm vi khoa/phòng được giao.');
    }
    return device;
  },

  listDevices: function (token, filter, page) {
    var auth = Auth.assertPermission(token, DEVICE_MODULE, 'VIEW');
    filter = filter || {};
    var pageSize = 20;

    var sheetFilters = {};
    if (filter.khoaPhongId) sheetFilters.KHOA_PHONG_ID = filter.khoaPhongId;
    if (filter.nhomThietBiId) sheetFilters.NHOM_THIET_BI_ID = filter.nhomThietBiId;
    if (filter.trangThai) sheetFilters.TRANG_THAI_QUAN_LY = filter.trangThai;

    var all = Database.list('01_THIET_BI', { filters: sheetFilters }).items;
    all = this._applyScopeFilter_(all, auth.scope);

    if (!Utils.isBlank(filter.keyword)) {
      var kw = String(filter.keyword).trim().toLowerCase();
      all = all.filter(function (row) {
        return String(row.TEN_THIET_BI).toLowerCase().indexOf(kw) !== -1 ||
          String(row.MA_THIET_BI).toLowerCase().indexOf(kw) !== -1 ||
          String(row.SERIAL).toLowerCase().indexOf(kw) !== -1;
      });
    }

    var total = all.length;
    var currentPage = page || 1;
    var start = (currentPage - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), total: total, page: currentPage, pageSize: pageSize };
  },

  /** Số liệu tối thiểu cho Trang chủ Sprint 1.2 — Dashboard đầy đủ (cảnh báo, biểu đồ...) thuộc giai đoạn sau. */
  getDashboardSummary: function (token) {
    var auth = Auth.assertPermission(token, DEVICE_MODULE, 'VIEW');
    var all = this._applyScopeFilter_(Database.list('01_THIET_BI', {}).items, auth.scope);
    var countByStatus = {};
    all.forEach(function (row) {
      countByStatus[row.TRANG_THAI_QUAN_LY] = (countByStatus[row.TRANG_THAI_QUAN_LY] || 0) + 1;
    });
    return {
      total: all.length,
      dangSuDung: countByStatus[DEVICE_STATUS.DANG_SU_DUNG] || 0,
      dangTiepNhan: countByStatus[DEVICE_STATUS.DANG_TIEP_NHAN] || 0,
      tamNgung: countByStatus[DEVICE_STATUS.TAM_NGUNG_SU_DUNG] || 0
    };
  }
};
