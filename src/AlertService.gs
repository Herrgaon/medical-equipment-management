/**
 * Cảnh báo (23_CANH_BAO) + Công việc (36_CONG_VIEC) — mục 7 tài liệu thiết kế.
 *
 * Phạm vi đã làm ở lượt này (MVP mục 7.2 — luồng Cảnh báo → Công việc thủ công + quét tự động
 * theo hạn): tạo/đóng cảnh báo thủ công, giao việc từ cảnh báo hoặc tạo việc độc lập, người được
 * giao xử lý (Bắt đầu → Nộp xác nhận), người có quyền Sửa module này (Super Admin/Quản lý thiết
 * bị — xem ma trận mục 5, module này KHÔNG có cột "Duyệt" nên dùng luôn quyền Sửa) xác nhận đóng.
 * runDailyScan() quét hạn Bảo hành/Kiểm định/Hiệu chuẩn/Bảo trì theo ngưỡng SO_NGAY_CANH_BAO_TRUOC
 * cấu hình ở 27_CAU_HINH (không có cấu hình khớp = không tự sinh cảnh báo, không tự bịa ngưỡng).
 *
 * CHƯA làm (còn thiếu so với mục 7.1 tài liệu thiết kế, cần làm tiếp sau):
 * - Cảnh báo sự kiện tức thời (sự cố Cao/Khẩn cấp, kiểm định Không đạt, kiểm kê chênh lệch, hồ sơ
 *   thiếu) — cần sửa từng service liên quan để tự gọi Alert.createAlert(), chưa nối dây.
 * - Giấy phép an toàn bức xạ (17_AN_TOAN_BUC_XA.THOI_HAN): mục 248 tài liệu thiết kế liệt kê
 *   LOAI_QUY_TAC chỉ gồm Bảo trì/Kiểm định/Hiệu chuẩn/Cảnh báo/Bảo hành, không có "Bức xạ" — chưa
 *   đủ căn cứ để tự thêm loại quy tắc mới, bỏ qua trong quét tự động lượt này.
 * - Quy tắc tự gán người phụ trách theo vai trò+khoa/phòng (mục 7.3) — hiện tại người tạo tự chọn
 *   người phụ trách bằng tay, không tự suy luận.
 *
 * NGUOI_PHU_TRACH_ID trên 36_CONG_VIEC lưu TEN_DANG_NHAP (25_NGUOI_DUNG), KHÔNG phải ID của
 * 09_NGUOI_PHU_TRACH (đó là danh mục tên người phụ trách thiết bị, không có tài khoản đăng nhập,
 * không thể tự xử lý/xác nhận công việc trong app) — nhất quán với NGUOI_DUYET/NGUOI_UPLOAD/
 * NGUOI_QUET_ID đã dùng ở các module khác trong hệ thống.
 */

var ALERT_MODULE = 'Cảnh báo & Công việc';
var ALERT_TYPES = ['Bảo hành', 'Bảo trì', 'Kiểm định', 'Hiệu chuẩn', 'Hồ sơ thiếu', 'Sự cố', 'Bức xạ', 'Khác'];
var ALERT_LEVELS = ['Thấp', 'TB', 'Cao', 'Khẩn cấp'];
var ALERT_STATUSES = { MOI: 'Mới', DA_GIAO_VIEC: 'Đã giao việc', DA_DONG: 'Đã đóng' };
var TASK_STATUSES = { MOI: 'Mới', DANG_XU_LY: 'Đang xử lý', CHO_XAC_NHAN: 'Chờ xác nhận', HOAN_THANH: 'Hoàn thành', QUA_HAN: 'Quá hạn' };

var Alert = {

  listActiveDevices: function (token) {
    var auth = Auth.assertPermission(token, ALERT_MODULE, 'VIEW');
    var all = Database.list('01_THIET_BI', {}).items.filter(function (d) { return d.TRANG_THAI_QUAN_LY !== DEVICE_STATUS.DA_THANH_LY; });
    all = Device._applyScopeFilter_(all, auth.scope);
    return all.map(function (d) { return { ID: d.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI, KHOA_PHONG_ID: d.KHOA_PHONG_ID }; });
  },

  /** Danh sách tài khoản còn hoạt động để chọn người phụ trách — không qua quyền "Người dùng & phân quyền"
   * (Quản lý thiết bị không có quyền đó) vì đây chỉ là danh sách chọn, không phải quản trị tài khoản. */
  listAssignableUsers: function (token) {
    Auth.assertPermission(token, ALERT_MODULE, 'VIEW');
    return Database.list('25_NGUOI_DUNG', { filters: { TRANG_THAI: 'Hoạt động' } }).items
      .map(function (u) { return { TEN_DANG_NHAP: u.TEN_DANG_NHAP, HO_TEN: u.HO_TEN }; });
  },

  _deviceMap_: function () {
    var map = {};
    Database.list('01_THIET_BI', {}).items.forEach(function (d) { map[d.ID] = d; });
    return map;
  },

  _applyDeviceScopeFilter_: function (rows, scope, deviceMap) {
    if (scope.type === 'ALL') return rows;
    var allowed = {};
    scope.departmentIds.forEach(function (id) { allowed[id] = true; });
    return rows.filter(function (r) {
      if (!r.THIET_BI_ID) return true; // cảnh báo/việc không gắn thiết bị cụ thể — hiển thị cho mọi phạm vi
      var d = deviceMap[r.THIET_BI_ID];
      return d && allowed[d.KHOA_PHONG_ID];
    });
  },

  // ---- Cảnh báo ----

  listAlerts: function (token, trangThai) {
    var auth = Auth.assertPermission(token, ALERT_MODULE, 'VIEW');
    var filters = {};
    if (!Utils.isBlank(trangThai)) filters.TRANG_THAI = trangThai;
    var rows = Database.list('23_CANH_BAO', { filters: filters }).items;
    var deviceMap = this._deviceMap_();
    rows = this._applyDeviceScopeFilter_(rows, auth.scope, deviceMap);
    return rows.map(function (r) {
      var d = deviceMap[r.THIET_BI_ID] || {};
      return {
        ID: r.ID, LOAI_CANH_BAO: r.LOAI_CANH_BAO, MUC_DO: r.MUC_DO, NGAY_PHAT_SINH: r.NGAY_PHAT_SINH,
        TRANG_THAI: r.TRANG_THAI, GHI_CHU: r.GHI_CHU, THIET_BI_ID: r.THIET_BI_ID,
        MA_THIET_BI: d.MA_THIET_BI || '', TEN_THIET_BI: d.TEN_THIET_BI || ''
      };
    }).sort(function (a, b) { return new Date(b.NGAY_PHAT_SINH) - new Date(a.NGAY_PHAT_SINH); });
  },

  createAlert: function (token, data) {
    var auth = Auth.assertPermission(token, ALERT_MODULE, 'CREATE');
    Utils.assert(ALERT_TYPES.indexOf(data.LOAI_CANH_BAO) !== -1, ERROR_CODES.VALIDATION_ERROR, 'Loại cảnh báo không hợp lệ.');
    Utils.assert(ALERT_LEVELS.indexOf(data.MUC_DO) !== -1, ERROR_CODES.VALIDATION_ERROR, 'Mức độ không hợp lệ.');
    if (!Utils.isBlank(data.THIET_BI_ID)) {
      Utils.assert(Database.getById('01_THIET_BI', data.THIET_BI_ID), ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị.');
    }

    var result = Database.insertRow('23_CANH_BAO', {
      THIET_BI_ID: data.THIET_BI_ID || '',
      LOAI_CANH_BAO: data.LOAI_CANH_BAO,
      MUC_DO: data.MUC_DO,
      NGAY_PHAT_SINH: Utils.nowIso(),
      TRANG_THAI: ALERT_STATUSES.MOI,
      GHI_CHU: data.GHI_CHU || ''
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CREATE_ALERT', '23_CANH_BAO', result.data.ID, null, result.data);
    return result.data;
  },

  closeAlert: function (token, alertId) {
    var auth = Auth.assertPermission(token, ALERT_MODULE, 'LOCK');
    var alert = Database.getById('23_CANH_BAO', alertId);
    Utils.assert(alert, ERROR_CODES.NOT_FOUND, 'Không tìm thấy cảnh báo.');
    Database.updateRowById('23_CANH_BAO', alertId, { TRANG_THAI: ALERT_STATUSES.DA_DONG }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CLOSE_ALERT', '23_CANH_BAO', alertId, { TRANG_THAI: alert.TRANG_THAI }, { TRANG_THAI: ALERT_STATUSES.DA_DONG });
    return { closed: true };
  },

  // ---- Công việc ----

  listTasks: function (token, filter) {
    var auth = Auth.assertPermission(token, ALERT_MODULE, 'VIEW');
    filter = filter || {};
    var filters = {};
    if (!Utils.isBlank(filter.trangThai)) filters.TRANG_THAI = filter.trangThai;
    if (filter.assignedToMe) filters.NGUOI_PHU_TRACH_ID = auth.user.tenDangNhap;
    var rows = Database.list('36_CONG_VIEC', { filters: filters }).items;
    var deviceMap = this._deviceMap_();
    rows = this._applyDeviceScopeFilter_(rows, auth.scope, deviceMap);
    var now = Date.now();
    return rows.map(function (r) {
      var d = deviceMap[r.THIET_BI_ID] || {};
      return {
        ID: r.ID, CANH_BAO_ID: r.CANH_BAO_ID, LOAI_CONG_VIEC: r.LOAI_CONG_VIEC,
        NGUOI_PHU_TRACH_ID: r.NGUOI_PHU_TRACH_ID, HAN_XU_LY: r.HAN_XU_LY, TRANG_THAI: r.TRANG_THAI,
        GHI_CHU: r.GHI_CHU, THIET_BI_ID: r.THIET_BI_ID, MA_THIET_BI: d.MA_THIET_BI || '', TEN_THIET_BI: d.TEN_THIET_BI || '',
        isOverdue: !!r.HAN_XU_LY && r.TRANG_THAI !== TASK_STATUSES.HOAN_THANH && new Date(r.HAN_XU_LY).getTime() < now
      };
    }).sort(function (a, b) { return new Date(b.NGAY_TAO) - new Date(a.NGAY_TAO); });
  },

  createTask: function (token, data) {
    var auth = Auth.assertPermission(token, ALERT_MODULE, 'CREATE');
    Utils.assert(!Utils.isBlank(data.LOAI_CONG_VIEC), ERROR_CODES.VALIDATION_ERROR, 'Thiếu loại công việc.');
    Utils.assert(!Utils.isBlank(data.NGUOI_PHU_TRACH_ID), ERROR_CODES.VALIDATION_ERROR, 'Thiếu người phụ trách.');
    Utils.assert(Database.findOne('25_NGUOI_DUNG', { TEN_DANG_NHAP: data.NGUOI_PHU_TRACH_ID }), ERROR_CODES.VALIDATION_ERROR, 'Người phụ trách không hợp lệ.');

    var linkedAlert = null;
    var thietBiId = data.THIET_BI_ID || '';
    if (!Utils.isBlank(data.CANH_BAO_ID)) {
      linkedAlert = Database.getById('23_CANH_BAO', data.CANH_BAO_ID);
      Utils.assert(linkedAlert, ERROR_CODES.NOT_FOUND, 'Không tìm thấy cảnh báo liên kết.');
      thietBiId = linkedAlert.THIET_BI_ID || thietBiId;
    }

    var result = Database.insertRow('36_CONG_VIEC', {
      THIET_BI_ID: thietBiId,
      CANH_BAO_ID: data.CANH_BAO_ID || '',
      LOAI_CONG_VIEC: data.LOAI_CONG_VIEC,
      NGUOI_PHU_TRACH_ID: data.NGUOI_PHU_TRACH_ID,
      HAN_XU_LY: data.HAN_XU_LY || '',
      TRANG_THAI: TASK_STATUSES.MOI,
      GHI_CHU: data.GHI_CHU || ''
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CREATE_TASK', '36_CONG_VIEC', result.data.ID, null, result.data);

    if (linkedAlert) {
      Database.updateRowById('23_CANH_BAO', linkedAlert.ID, { TRANG_THAI: ALERT_STATUSES.DA_GIAO_VIEC }, auth.user.tenDangNhap);
    }
    return result.data;
  },

  _assertOwnTask_: function (auth, task) {
    if (auth.user.vaiTro === ROLES.TECHNICIAN) {
      Utils.assert(task.NGUOI_PHU_TRACH_ID === auth.user.tenDangNhap, ERROR_CODES.PERMISSION_DENIED,
        'Chỉ người được giao mới được cập nhật công việc này.');
    }
  },

  startTask: function (token, taskId) {
    var auth = Auth.assertPermission(token, ALERT_MODULE, 'EDIT');
    var task = Database.getById('36_CONG_VIEC', taskId);
    Utils.assert(task, ERROR_CODES.NOT_FOUND, 'Không tìm thấy công việc.');
    this._assertOwnTask_(auth, task);
    Utils.assert(task.TRANG_THAI === TASK_STATUSES.MOI || task.TRANG_THAI === TASK_STATUSES.QUA_HAN,
      ERROR_CODES.VALIDATION_ERROR, 'Công việc không ở trạng thái có thể bắt đầu.');
    Database.updateRowById('36_CONG_VIEC', taskId, { TRANG_THAI: TASK_STATUSES.DANG_XU_LY }, auth.user.tenDangNhap);
    return { started: true };
  },

  submitTaskForConfirmation: function (token, taskId, note) {
    var auth = Auth.assertPermission(token, ALERT_MODULE, 'EDIT');
    var task = Database.getById('36_CONG_VIEC', taskId);
    Utils.assert(task, ERROR_CODES.NOT_FOUND, 'Không tìm thấy công việc.');
    this._assertOwnTask_(auth, task);
    Utils.assert(task.TRANG_THAI === TASK_STATUSES.DANG_XU_LY, ERROR_CODES.VALIDATION_ERROR, 'Công việc chưa ở trạng thái đang xử lý.');
    var patch = { TRANG_THAI: TASK_STATUSES.CHO_XAC_NHAN };
    if (!Utils.isBlank(note)) patch.GHI_CHU = ((task.GHI_CHU || '') + ' | ' + note).trim();
    Database.updateRowById('36_CONG_VIEC', taskId, patch, auth.user.tenDangNhap);
    return { submitted: true };
  },

  /** Xác nhận hoàn thành — chỉ Super Admin/Quản lý thiết bị (module này không có quyền Duyệt riêng,
   * dùng quyền Sửa + chặn Kỹ thuật viên tự xác nhận việc của chính mình). */
  confirmTaskDone: function (token, taskId) {
    var auth = Auth.assertPermission(token, ALERT_MODULE, 'EDIT');
    Utils.assert(auth.user.vaiTro !== ROLES.TECHNICIAN, ERROR_CODES.PERMISSION_DENIED,
      'Kỹ thuật viên không tự xác nhận hoàn thành công việc của mình.');
    var task = Database.getById('36_CONG_VIEC', taskId);
    Utils.assert(task, ERROR_CODES.NOT_FOUND, 'Không tìm thấy công việc.');
    Utils.assert(task.TRANG_THAI === TASK_STATUSES.CHO_XAC_NHAN, ERROR_CODES.VALIDATION_ERROR, 'Công việc chưa được nộp chờ xác nhận.');

    Database.updateRowById('36_CONG_VIEC', taskId, { TRANG_THAI: TASK_STATUSES.HOAN_THANH }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CONFIRM_TASK_DONE', '36_CONG_VIEC', taskId, null, { TRANG_THAI: TASK_STATUSES.HOAN_THANH });

    if (!Utils.isBlank(task.CANH_BAO_ID)) {
      var linkedAlert = Database.getById('23_CANH_BAO', task.CANH_BAO_ID);
      if (linkedAlert && linkedAlert.TRANG_THAI !== ALERT_STATUSES.DA_DONG) {
        Database.updateRowById('23_CANH_BAO', task.CANH_BAO_ID, { TRANG_THAI: ALERT_STATUSES.DA_DONG }, auth.user.tenDangNhap);
      }
    }
    return { confirmed: true };
  },

  // ---- Quét tự động hằng ngày (chạy tay/qua trigger, KHÔNG lộ ra Core.gs) ----

  /** Đã có cảnh báo còn mở (Mới/Đã giao việc) cùng thiết bị + loại chưa — tránh sinh trùng mỗi ngày. */
  _hasOpenAlert_: function (openAlerts, deviceId, loaiCanhBao) {
    return openAlerts.some(function (a) { return a.THIET_BI_ID === deviceId && a.LOAI_CANH_BAO === loaiCanhBao; });
  },

  _scanExpiry_: function (openAlerts, devices, loaiQuyTac, loaiCanhBao, getExpiryDate, actor) {
    var self = this;
    var configRows = Database.list('27_CAU_HINH', { filters: { LOAI_QUY_TAC: loaiQuyTac, TRANG_THAI: 'Hoạt động' } }).items;
    if (configRows.length === 0) return 0; // chưa có cấu hình = không tự bịa ngưỡng, bỏ qua loại này

    var created = 0;
    var now = Date.now();
    var msPerDay = 86400000;

    devices.forEach(function (device) {
      var rule = configRows.filter(function (r) { return r.LOAI_THIET_BI_ID === device.LOAI_THIET_BI_ID; })[0] ||
        configRows.filter(function (r) { return Utils.isBlank(r.LOAI_THIET_BI_ID); })[0];
      if (!rule || Utils.isBlank(rule.SO_NGAY_CANH_BAO_TRUOC)) return;

      var expiryDate = getExpiryDate(device);
      if (!expiryDate) return;
      var daysLeft = Math.ceil((expiryDate.getTime() - now) / msPerDay);
      if (daysLeft > Number(rule.SO_NGAY_CANH_BAO_TRUOC)) return; // còn xa hạn, chưa cần cảnh báo

      if (self._hasOpenAlert_(openAlerts, device.ID, loaiCanhBao)) return;
      var muc = daysLeft < 0 ? 'Cao' : 'TB';
      var ghiChu = daysLeft < 0
        ? ('Đã quá hạn ' + Math.abs(daysLeft) + ' ngày.')
        : ('Còn ' + daysLeft + ' ngày tới hạn.');

      var result = Database.insertRow('23_CANH_BAO', {
        THIET_BI_ID: device.ID, LOAI_CANH_BAO: loaiCanhBao, MUC_DO: muc,
        NGAY_PHAT_SINH: Utils.nowIso(), TRANG_THAI: ALERT_STATUSES.MOI, GHI_CHU: ghiChu
      }, actor);
      Database.appendAuditLog(actor, 'AUTO_ALERT', '23_CANH_BAO', result.data.ID, null, result.data);
      openAlerts.push(result.data);
      created++;
    });
    return created;
  },

  /** Lấy ngày hết hạn mới nhất trong 1 sheet nghiệp vụ theo thiết bị (bản ghi có NGAY_THUC_HIEN/NGAY_KE_HOACH mới nhất). */
  _latestExpiryBySheet_: function (sheetName, dateOutField, orderField) {
    var rows = Database.list(sheetName, {}).items;
    var byDevice = {};
    rows.forEach(function (r) {
      if (!r.THIET_BI_ID || Utils.isBlank(r[dateOutField])) return;
      var existing = byDevice[r.THIET_BI_ID];
      if (!existing || new Date(r[orderField]) > new Date(existing[orderField])) byDevice[r.THIET_BI_ID] = r;
    });
    return byDevice;
  },

  runDailyScan: function () {
    var actor = 'system-daily-scan';
    var devices = Database.list('01_THIET_BI', {}).items.filter(function (d) { return d.TRANG_THAI_QUAN_LY !== DEVICE_STATUS.DA_THANH_LY; });
    var openAlerts = Database.list('23_CANH_BAO', {}).items.filter(function (a) { return a.TRANG_THAI !== ALERT_STATUSES.DA_DONG; });
    var totalCreated = 0;

    // Bảo hành: hạn nằm ngay trên 01_THIET_BI, không cần tra sheet nghiệp vụ riêng.
    totalCreated += this._scanExpiry_(openAlerts, devices, 'Bảo hành', 'Bảo hành', function (d) {
      return Utils.isBlank(d.NGAY_HET_BAO_HANH) ? null : new Date(d.NGAY_HET_BAO_HANH);
    }, actor);

    var kiemDinhMap = this._latestExpiryBySheet_('15_KIEM_DINH', 'NGAY_HET_HAN', 'NGAY_THUC_HIEN');
    totalCreated += this._scanExpiry_(openAlerts, devices, 'Kiểm định', 'Kiểm định', function (d) {
      var r = kiemDinhMap[d.ID]; return r ? new Date(r.NGAY_HET_HAN) : null;
    }, actor);

    var hieuChuanMap = this._latestExpiryBySheet_('16_HIEU_CHUAN', 'NGAY_HET_HAN', 'NGAY_THUC_HIEN');
    totalCreated += this._scanExpiry_(openAlerts, devices, 'Hiệu chuẩn', 'Hiệu chuẩn', function (d) {
      var r = hieuChuanMap[d.ID]; return r ? new Date(r.NGAY_HET_HAN) : null;
    }, actor);

    var baoTriMap = this._latestExpiryBySheet_('14_BAO_TRI', 'KY_TIEP_THEO', 'NGAY_KE_HOACH');
    totalCreated += this._scanExpiry_(openAlerts, devices, 'Bảo trì', 'Bảo trì', function (d) {
      var r = baoTriMap[d.ID]; return r ? new Date(r.KY_TIEP_THEO) : null;
    }, actor);

    // Công việc quá hạn: chuyển trạng thái hiển thị (không tự đóng, cần minh chứng + xác nhận).
    var overdueCount = 0;
    var now = Date.now();
    Database.list('36_CONG_VIEC', {}).items.forEach(function (t) {
      if (!t.HAN_XU_LY || t.TRANG_THAI === TASK_STATUSES.HOAN_THANH || t.TRANG_THAI === TASK_STATUSES.QUA_HAN) return;
      if (new Date(t.HAN_XU_LY).getTime() < now) {
        Database.updateRowById('36_CONG_VIEC', t.ID, { TRANG_THAI: TASK_STATUSES.QUA_HAN }, actor);
        overdueCount++;
      }
    });

    Logger.log('runDailyScan: sinh ' + totalCreated + ' cảnh báo mới, đánh dấu ' + overdueCount + ' công việc quá hạn.');
    return { alertsCreated: totalCreated, tasksMarkedOverdue: overdueCount };
  },

  /** Cài time-driven trigger chạy runDailyScan() mỗi ngày — chạy TAY 1 lần từ Apps Script editor
   * (giống setupDatabase/seedInitialData), không lộ ra Core.gs. Idempotent: xoá trigger cũ cùng
   * tên hàm trước khi tạo, tránh nhân đôi nếu chạy lại. */
  installDailyScanTrigger: function () {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'runDailyScan') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('runDailyScan').timeBased().everyDays(1).atHour(6).create();
    Logger.log('Đã cài time-driven trigger chạy runDailyScan() mỗi ngày lúc ~6h sáng.');
  }
};

function runDailyScan() { return Alert.runDailyScan(); }
function installDailyScanTrigger() { Alert.installDailyScanTrigger(); }
