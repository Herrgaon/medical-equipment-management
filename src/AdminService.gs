/**
 * Quản trị hệ thống: CRUD danh mục (02-09), quản lý người dùng, xem audit log.
 * Sprint 1.4 — Giai đoạn 1 (Dữ liệu nền).
 */

var CATEGORY_MODULE = 'Danh mục & cấu hình';
var USER_ADMIN_MODULE = 'Người dùng & phân quyền';
var AUDIT_MODULE = 'Audit log';

// Whitelist tabName được phép thao tác qua Admin.category* — KHÔNG nhận tabName tự do từ client,
// nếu không client có thể lợi dụng gọi sang các sheet khác (vd _SESSIONS, 28_AUDIT_LOG).
var ADMIN_CATEGORY_TABS = {
  '02_LOAI_THIET_BI': true, '03_NHOM_THIET_BI': true, '04_KHOA_PHONG': true, '05_VI_TRI': true,
  '06_HANG_SAN_XUAT': true, '07_NUOC_SAN_XUAT': true, '08_NHA_CUNG_CAP': true, '09_NGUOI_PHU_TRACH': true
};

var Admin = {

  _assertValidCategoryTab_: function (tabName) {
    Utils.assert(ADMIN_CATEGORY_TABS[tabName], ERROR_CODES.VALIDATION_ERROR, 'Danh mục không hợp lệ: ' + tabName);
  },

  listCategoryItems: function (token, tabName) {
    Auth.assertPermission(token, CATEGORY_MODULE, 'VIEW');
    this._assertValidCategoryTab_(tabName);
    return Database.list(tabName, {}).items;
  },

  createCategoryItem: function (token, tabName, data) {
    var auth = Auth.assertPermission(token, CATEGORY_MODULE, 'CREATE');
    this._assertValidCategoryTab_(tabName);
    Utils.assert(!Utils.isBlank(data.TEN), ERROR_CODES.VALIDATION_ERROR, 'Thiếu tên danh mục.');
    var result = Database.insertRow(tabName, {
      MA: data.MA || '', TEN: data.TEN, MO_TA: data.MO_TA || '', CAP_TREN_ID: data.CAP_TREN_ID || '',
      TRANG_THAI: 'Hoạt động'
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CREATE_CATEGORY', tabName, result.data.ID, null, result.data);
    return result.data;
  },

  updateCategoryItem: function (token, tabName, id, data) {
    var auth = Auth.assertPermission(token, CATEGORY_MODULE, 'EDIT');
    this._assertValidCategoryTab_(tabName);
    var patch = {};
    ['MA', 'TEN', 'MO_TA', 'CAP_TREN_ID', 'TRANG_THAI'].forEach(function (f) {
      if (data.hasOwnProperty(f)) patch[f] = data[f];
    });
    // Không xoá cứng danh mục đã dùng (bất biến kiến trúc) — chỉ đổi TRANG_THAI Hoạt động/Ngừng sử dụng.
    var result = Database.updateRowById(tabName, id, patch, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'UPDATE_CATEGORY', tabName, id, null, patch);
    return result.data;
  },

  // ---- Cấu hình quy tắc (27_CAU_HINH) — chu kỳ/ngưỡng cảnh báo theo loại thiết bị. ----
  // CHƯA có dữ liệu mặc định: các giá trị này thuộc mục 14 tài liệu thiết kế (cần Khoa Dược -
  // VTTBYT xác nhận), Admin tự nhập khi có thông tin thật, hệ thống không tự bịa số liệu.

  listConfig: function (token) {
    Auth.assertPermission(token, CATEGORY_MODULE, 'VIEW');
    return Database.list('27_CAU_HINH', {}).items;
  },

  createConfig: function (token, data) {
    var auth = Auth.assertPermission(token, CATEGORY_MODULE, 'CREATE');
    Utils.assert(!Utils.isBlank(data.LOAI_QUY_TAC), ERROR_CODES.VALIDATION_ERROR, 'Thiếu loại quy tắc.');
    var result = Database.insertRow('27_CAU_HINH', {
      TEN: (data.LOAI_QUY_TAC || '') + (data.LOAI_THIET_BI_ID ? ' — ' + data.LOAI_THIET_BI_ID : ' (mặc định mọi loại)'),
      LOAI_THIET_BI_ID: data.LOAI_THIET_BI_ID || '',
      LOAI_QUY_TAC: data.LOAI_QUY_TAC,
      CHU_KY_THANG: data.CHU_KY_THANG || '',
      SO_NGAY_CANH_BAO_TRUOC: data.SO_NGAY_CANH_BAO_TRUOC || '',
      CAN_CU_AP_DUNG: data.CAN_CU_AP_DUNG || '',
      BAT_BUOC: data.BAT_BUOC || 'Chưa xác định',
      TRANG_THAI: 'Hoạt động'
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CREATE_CONFIG', '27_CAU_HINH', result.data.ID, null, result.data);
    return result.data;
  },

  updateConfig: function (token, id, data) {
    var auth = Auth.assertPermission(token, CATEGORY_MODULE, 'EDIT');
    var patch = {};
    ['LOAI_THIET_BI_ID', 'LOAI_QUY_TAC', 'CHU_KY_THANG', 'SO_NGAY_CANH_BAO_TRUOC', 'CAN_CU_AP_DUNG', 'BAT_BUOC', 'TRANG_THAI'].forEach(function (f) {
      if (data.hasOwnProperty(f)) patch[f] = data[f];
    });
    var result = Database.updateRowById('27_CAU_HINH', id, patch, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'UPDATE_CONFIG', '27_CAU_HINH', id, null, patch);
    return result.data;
  },

  /**
   * Tra cứu quy tắc áp dụng cho 1 loại thiết bị + loại nghiệp vụ (Kiểm định/Hiệu chuẩn/Bảo trì...).
   * Ưu tiên quy tắc khớp đúng LOAI_THIET_BI_ID; nếu không có, dùng quy tắc để trống (mặc định chung).
   * Dùng nội bộ (Inspection/Calibration/Maintenance service), không phải endpoint Core.gs.
   */
  findConfigRule_: function (loaiThietBiId, loaiQuyTac) {
    var rows = Database.list('27_CAU_HINH', { filters: { LOAI_QUY_TAC: loaiQuyTac } }).items;
    var specific = rows.filter(function (r) { return r.LOAI_THIET_BI_ID === loaiThietBiId; })[0];
    if (specific) return specific;
    return rows.filter(function (r) { return Utils.isBlank(r.LOAI_THIET_BI_ID); })[0] || null;
  },

  // ---- Người dùng ----

  listUsers: function (token) {
    Auth.assertPermission(token, USER_ADMIN_MODULE, 'VIEW');
    return Database.list('25_NGUOI_DUNG', {}).items.map(function (u) {
      var copy = Object.assign({}, u);
      delete copy.PASSWORD_HASH; delete copy.PASSWORD_SALT; // không bao giờ trả hash/salt ra client
      return copy;
    });
  },

  /** Danh sách vai trò để chọn — mỗi vai trò lấy 1 ID đại diện trong 26_QUYEN (xem ghi chú ROLES trong Constants.gs). */
  listRoles: function (token) {
    Auth.assertPermission(token, USER_ADMIN_MODULE, 'VIEW');
    var seen = {};
    var result = [];
    Database.list('26_QUYEN', {}).items.forEach(function (row) {
      if (!seen[row.VAI_TRO]) { seen[row.VAI_TRO] = true; result.push({ id: row.ID, ten: row.VAI_TRO }); }
    });
    return result;
  },

  createUser: function (token, data, initialPassword) {
    var auth = Auth.assertPermission(token, USER_ADMIN_MODULE, 'CREATE');
    Utils.assert(!Utils.isBlank(data.TEN_DANG_NHAP), ERROR_CODES.VALIDATION_ERROR, 'Thiếu tên đăng nhập.');
    Utils.assert(!Utils.isBlank(data.HO_TEN), ERROR_CODES.VALIDATION_ERROR, 'Thiếu họ tên.');
    Utils.assert(!Utils.isBlank(initialPassword) && initialPassword.length >= 8, ERROR_CODES.VALIDATION_ERROR,
      'Mật khẩu ban đầu phải có ít nhất 8 ký tự.');

    var loginId = String(data.TEN_DANG_NHAP).trim();
    var existing = Database.findOne('25_NGUOI_DUNG', { TEN_DANG_NHAP: loginId });
    Utils.assert(!existing, ERROR_CODES.DUPLICATE, 'Tên đăng nhập "' + loginId + '" đã tồn tại.');

    var result = Database.insertRow('25_NGUOI_DUNG', {
      TEN_DANG_NHAP: loginId,
      HO_TEN: data.HO_TEN,
      NICKNAME: data.NICKNAME || '',
      CHUC_DANH: data.CHUC_DANH || '',
      VAI_TRO_ID: data.VAI_TRO_ID || '',
      KHOA_PHONG_PHU_TRACH: data.KHOA_PHONG_PHU_TRACH || '',
      TRANG_THAI: 'Đang hoạt động'
    }, auth.user.tenDangNhap);
    var userRow = Database.getById('25_NGUOI_DUNG', result.data.ID);
    Auth.setPassword_(userRow, initialPassword, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CREATE_USER', '25_NGUOI_DUNG', result.data.ID, null, { TEN_DANG_NHAP: loginId });
    return { id: result.data.ID };
  },

  updateUser: function (token, id, data) {
    var auth = Auth.assertPermission(token, USER_ADMIN_MODULE, 'EDIT');
    var patch = {};
    ['HO_TEN', 'NICKNAME', 'CHUC_DANH', 'VAI_TRO_ID', 'KHOA_PHONG_PHU_TRACH', 'TRANG_THAI'].forEach(function (f) {
      if (data.hasOwnProperty(f)) patch[f] = data[f];
    });
    var result = Database.updateRowById('25_NGUOI_DUNG', id, patch, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'UPDATE_USER', '25_NGUOI_DUNG', id, null, patch);
    return result.data;
  },

  /** Admin đặt lại mật khẩu cho người khác — KHÔNG cần biết mật khẩu cũ (khác changePassword tự phục vụ). */
  resetUserPassword: function (token, id, newPassword) {
    var auth = Auth.assertPermission(token, USER_ADMIN_MODULE, 'EDIT');
    Utils.assert(!Utils.isBlank(newPassword) && newPassword.length >= 8, ERROR_CODES.VALIDATION_ERROR,
      'Mật khẩu mới phải có ít nhất 8 ký tự.');
    var userRow = Database.getById('25_NGUOI_DUNG', id);
    Utils.assert(userRow, ERROR_CODES.NOT_FOUND, 'Không tìm thấy người dùng.');
    Auth.setPassword_(userRow, newPassword, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'RESET_PASSWORD', '25_NGUOI_DUNG', id, null, null);
    return { reset: true };
  },

  // ---- Audit log ----

  getAuditLog: function (token, page) {
    Auth.assertPermission(token, AUDIT_MODULE, 'VIEW');
    var pageSize = 30;
    var all = Database.list('28_AUDIT_LOG', {}).items;
    all.sort(function (a, b) { return new Date(b.THOI_GIAN) - new Date(a.THOI_GIAN); });
    var currentPage = page || 1;
    var start = (currentPage - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), total: all.length, page: currentPage, pageSize: pageSize };
  }
};
