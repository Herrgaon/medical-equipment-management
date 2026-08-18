/**
 * Sự cố (19_SU_CO) + Sửa chữa (20_SUA_CHUA) + Bảo trì (14_BAO_TRI) — mục 4.4, 4.6, 6.1, 6.3
 * tài liệu thiết kế. Gộp Bảo trì vào đây (khác nhóm file trong tài liệu thiết kế gốc) vì cả 3
 * cùng hội tụ về đúng 1 điểm trong state machine: "Đang bảo trì / Đang sửa chữa" → "Chờ kiểm tra
 * sau sửa chữa" → (Được phép | Chưa được phép) → "Đang sử dụng" | "Tạm ngừng sử dụng" — dùng
 * chung 1 cơ chế xác nhận an toàn 2 bước (KTV báo hoàn thành, QLTB duyệt) thay vì viết trùng logic.
 */

var TECH_ASSURANCE_MODULE_2 = 'Sự cố/Sửa chữa/Downtime/Phụ tùng';
var MAINTENANCE_MODULE = 'Bảo hành/Bảo trì/Kiểm định/Hiệu chuẩn';

var IncidentRepair = {

  listActiveDevices: function (token, module) {
    var auth = Auth.assertPermission(token, module, 'VIEW');
    var all = Database.list('01_THIET_BI', {}).items.filter(function (d) { return d.TRANG_THAI_QUAN_LY !== DEVICE_STATUS.DA_THANH_LY; });
    all = Device._applyScopeFilter_(all, auth.scope);
    return all.map(function (d) { return { ID: d.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI, TRANG_THAI_QUAN_LY: d.TRANG_THAI_QUAN_LY }; });
  },

  // ---- Sự cố ----
  createIncident: function (token, deviceId, data) {
    var auth = Auth.assertPermission(token, TECH_ASSURANCE_MODULE_2, 'CREATE');
    var device = Database.getById('01_THIET_BI', deviceId);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị.');
    Utils.assert(!Utils.isBlank(data.NGAY_BAO_SU_CO), ERROR_CODES.VALIDATION_ERROR, 'Thiếu ngày báo sự cố.');
    Utils.assert(!Utils.isBlank(data.MO_TA), ERROR_CODES.VALIDATION_ERROR, 'Thiếu mô tả sự cố.');

    var result = Database.insertRow('19_SU_CO', {
      THIET_BI_ID: deviceId,
      NGAY_BAO_SU_CO: data.NGAY_BAO_SU_CO,
      NGUON_BAO: data.NGUON_BAO || '',
      MO_TA: data.MO_TA,
      MUC_DO: data.MUC_DO || 'Thấp',
      NGUOI_BAO: data.NGUOI_BAO || auth.user.tenDangNhap,
      TRANG_THAI: 'Mới'
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CREATE_INCIDENT', '19_SU_CO', result.data.ID, null, result.data);

    // Sự cố mức Cao/Khẩn cấp -> đưa thiết bị vào sửa chữa ngay (mục 6.1 "Báo sự cố nghiêm trọng").
    if ((data.MUC_DO === 'Cao' || data.MUC_DO === 'Khẩn cấp') && device.TRANG_THAI_QUAN_LY === DEVICE_STATUS.DANG_SU_DUNG) {
      this._transitionDevice_(deviceId, DEVICE_STATUS.DANG_SUA_CHUA, auth.user.tenDangNhap);
    }
    return result.data;
  },

  listIncidentsByDevice: function (token, deviceId) {
    Auth.assertPermission(token, TECH_ASSURANCE_MODULE_2, 'VIEW');
    return Database.list('19_SU_CO', { filters: { THIET_BI_ID: deviceId } }).items
      .sort(function (a, b) { return new Date(b.NGAY_BAO_SU_CO) - new Date(a.NGAY_BAO_SU_CO); });
  },

  // ---- Sửa chữa ----
  createRepair: function (token, deviceId, incidentId, data) {
    var auth = Auth.assertPermission(token, TECH_ASSURANCE_MODULE_2, 'CREATE');
    var device = Database.getById('01_THIET_BI', deviceId);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị.');

    // Tạo phiếu sửa chữa đưa thiết bị vào "Đang sửa chữa" nếu chưa ở đó (vd sự cố mức thấp không
    // tự chuyển, nhưng khi thực sự bắt đầu sửa thì phải chuyển).
    if (device.TRANG_THAI_QUAN_LY === DEVICE_STATUS.DANG_SU_DUNG) {
      this._transitionDevice_(deviceId, DEVICE_STATUS.DANG_SUA_CHUA, auth.user.tenDangNhap);
    }

    var result = Database.insertRow('20_SUA_CHUA', {
      THIET_BI_ID: deviceId,
      SU_CO_ID: incidentId || '',
      NGUYEN_NHAN: data.NGUYEN_NHAN || '',
      NOI_DUNG: data.NOI_DUNG || '',
      BIEN_PHAP: data.BIEN_PHAP || '',
      DON_VI_THUC_HIEN: data.DON_VI_THUC_HIEN || '',
      NGAY_BAT_DAU: data.NGAY_BAT_DAU || '',
      NGAY_HOAN_THANH: '',
      CHI_PHI: data.CHI_PHI || '',
      KET_QUA_KIEM_TRA_SAU_SUA: '',
      XAC_NHAN_SU_DUNG: ''
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CREATE_REPAIR', '20_SUA_CHUA', result.data.ID, null, result.data);
    return result.data;
  },

  /** KTV báo hoàn thành sửa chữa — chuyển thiết bị sang "Chờ kiểm tra sau sửa chữa", CHƯA cho dùng lại. */
  markRepairDone: function (token, repairId, data) {
    var auth = Auth.assertPermission(token, TECH_ASSURANCE_MODULE_2, 'EDIT');
    var repair = Database.getById('20_SUA_CHUA', repairId);
    Utils.assert(repair, ERROR_CODES.NOT_FOUND, 'Không tìm thấy phiếu sửa chữa.');
    Utils.assert(Utils.isBlank(repair.NGAY_HOAN_THANH), ERROR_CODES.VALIDATION_ERROR, 'Phiếu này đã ghi nhận hoàn thành trước đó.');

    Database.updateRowById('20_SUA_CHUA', repairId, {
      NGAY_HOAN_THANH: data.NGAY_HOAN_THANH || Utils.nowIso(),
      KET_QUA_KIEM_TRA_SAU_SUA: data.KET_QUA_KIEM_TRA_SAU_SUA || '',
      CHI_PHI: data.CHI_PHI || repair.CHI_PHI
    }, auth.user.tenDangNhap);

    this._transitionDevice_(repair.THIET_BI_ID, DEVICE_STATUS.CHO_KIEM_TRA_SAU_SUA_CHUA, auth.user.tenDangNhap);
    return { done: true };
  },

  /** QLTB xác nhận an toàn — quyết định cuối: dùng lại được hay tạm ngừng. */
  confirmRepairSafety: function (token, repairId, decision) {
    var auth = Auth.assertPermission(token, TECH_ASSURANCE_MODULE_2, 'APPROVE');
    Utils.assert(decision === 'Được phép' || decision === 'Chưa được phép', ERROR_CODES.VALIDATION_ERROR, 'Quyết định không hợp lệ.');
    var repair = Database.getById('20_SUA_CHUA', repairId);
    Utils.assert(repair, ERROR_CODES.NOT_FOUND, 'Không tìm thấy phiếu sửa chữa.');
    Utils.assert(!Utils.isBlank(repair.NGAY_HOAN_THANH), ERROR_CODES.VALIDATION_ERROR, 'Phiếu chưa được KTV báo hoàn thành.');
    Utils.assert(Utils.isBlank(repair.XAC_NHAN_SU_DUNG), ERROR_CODES.VALIDATION_ERROR, 'Phiếu này đã được xác nhận trước đó.');

    var device = Database.getById('01_THIET_BI', repair.THIET_BI_ID);
    this._assertDeviceStatusIn_(device, [DEVICE_STATUS.CHO_KIEM_TRA_SAU_SUA_CHUA]);

    Database.updateRowById('20_SUA_CHUA', repairId, { XAC_NHAN_SU_DUNG: decision }, auth.user.tenDangNhap);
    var newStatus = (decision === 'Được phép') ? DEVICE_STATUS.DANG_SU_DUNG : DEVICE_STATUS.TAM_NGUNG_SU_DUNG;
    this._transitionDevice_(repair.THIET_BI_ID, newStatus, auth.user.tenDangNhap);
    return { confirmed: true };
  },

  listRepairsByDevice: function (token, deviceId) {
    Auth.assertPermission(token, TECH_ASSURANCE_MODULE_2, 'VIEW');
    return Database.list('20_SUA_CHUA', { filters: { THIET_BI_ID: deviceId } }).items
      .sort(function (a, b) { return new Date(b.NGAY_TAO) - new Date(a.NGAY_TAO); });
  },

  listRepairsAwaitingConfirm: function (token) {
    var auth = Auth.assertPermission(token, TECH_ASSURANCE_MODULE_2, 'VIEW');
    var repairs = Database.list('20_SUA_CHUA', {}).items.filter(function (r) {
      return !Utils.isBlank(r.NGAY_HOAN_THANH) && Utils.isBlank(r.XAC_NHAN_SU_DUNG);
    });
    var deviceMap = {};
    Database.list('01_THIET_BI', {}).items.forEach(function (d) { deviceMap[d.ID] = d; });
    if (auth.scope.type !== 'ALL') {
      repairs = repairs.filter(function (r) { var d = deviceMap[r.THIET_BI_ID]; return d && auth.scope.departmentIds.indexOf(d.KHOA_PHONG_ID) !== -1; });
    }
    return repairs.map(function (r) {
      var d = deviceMap[r.THIET_BI_ID] || {};
      return { ID: r.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI, KET_QUA_KIEM_TRA_SAU_SUA: r.KET_QUA_KIEM_TRA_SAU_SUA };
    });
  },

  // ---- Bảo trì (dùng chung cơ chế xác nhận an toàn với Sửa chữa) ----
  createMaintenance: function (token, deviceId, data) {
    var auth = Auth.assertPermission(token, MAINTENANCE_MODULE, 'CREATE');
    var device = Database.getById('01_THIET_BI', deviceId);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị.');
    this._assertDeviceStatusIn_(device, [DEVICE_STATUS.DANG_SU_DUNG]);

    var result = Database.insertRow('14_BAO_TRI', {
      THIET_BI_ID: deviceId,
      KY_BAO_TRI: data.KY_BAO_TRI || '',
      NGAY_KE_HOACH: data.NGAY_KE_HOACH || '',
      NGAY_THUC_HIEN: '',
      CHECKLIST_ID: data.CHECKLIST_ID || '',
      NGUOI_THUC_HIEN: data.NGUOI_THUC_HIEN || '',
      KET_QUA: '',
      KY_TIEP_THEO: ''
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CREATE_MAINTENANCE', '14_BAO_TRI', result.data.ID, null, result.data);
    this._transitionDevice_(deviceId, DEVICE_STATUS.DANG_BAO_TRI, auth.user.tenDangNhap);
    return result.data;
  },

  markMaintenanceDone: function (token, maintenanceId, data) {
    var auth = Auth.assertPermission(token, MAINTENANCE_MODULE, 'EDIT');
    var maint = Database.getById('14_BAO_TRI', maintenanceId);
    Utils.assert(maint, ERROR_CODES.NOT_FOUND, 'Không tìm thấy phiếu bảo trì.');
    Utils.assert(Utils.isBlank(maint.NGAY_THUC_HIEN), ERROR_CODES.VALIDATION_ERROR, 'Phiếu này đã ghi nhận thực hiện trước đó.');

    Database.updateRowById('14_BAO_TRI', maintenanceId, {
      NGAY_THUC_HIEN: data.NGAY_THUC_HIEN || Utils.nowIso(),
      KET_QUA: data.KET_QUA || '',
      KY_TIEP_THEO: data.KY_TIEP_THEO || ''
    }, auth.user.tenDangNhap);
    this._transitionDevice_(maint.THIET_BI_ID, DEVICE_STATUS.CHO_KIEM_TRA_SAU_SUA_CHUA, auth.user.tenDangNhap);
    return { done: true };
  },

  confirmMaintenanceSafety: function (token, maintenanceId, decision) {
    var auth = Auth.assertPermission(token, MAINTENANCE_MODULE, 'APPROVE');
    Utils.assert(decision === 'Được phép' || decision === 'Chưa được phép', ERROR_CODES.VALIDATION_ERROR, 'Quyết định không hợp lệ.');
    var maint = Database.getById('14_BAO_TRI', maintenanceId);
    Utils.assert(maint, ERROR_CODES.NOT_FOUND, 'Không tìm thấy phiếu bảo trì.');
    Utils.assert(!Utils.isBlank(maint.NGAY_THUC_HIEN), ERROR_CODES.VALIDATION_ERROR, 'Phiếu chưa được ghi nhận thực hiện.');

    var device = Database.getById('01_THIET_BI', maint.THIET_BI_ID);
    this._assertDeviceStatusIn_(device, [DEVICE_STATUS.CHO_KIEM_TRA_SAU_SUA_CHUA]);

    Database.updateRowById('14_BAO_TRI', maintenanceId, { KET_QUA: (maint.KET_QUA || '') + ' — Xác nhận: ' + decision }, auth.user.tenDangNhap);
    var newStatus = (decision === 'Được phép') ? DEVICE_STATUS.DANG_SU_DUNG : DEVICE_STATUS.TAM_NGUNG_SU_DUNG;
    this._transitionDevice_(maint.THIET_BI_ID, newStatus, auth.user.tenDangNhap);
    return { confirmed: true };
  },

  listMaintenanceByDevice: function (token, deviceId) {
    Auth.assertPermission(token, MAINTENANCE_MODULE, 'VIEW');
    return Database.list('14_BAO_TRI', { filters: { THIET_BI_ID: deviceId } }).items
      .sort(function (a, b) { return new Date(b.NGAY_TAO) - new Date(a.NGAY_TAO); });
  },

  listMaintenanceAwaitingConfirm: function (token) {
    var auth = Auth.assertPermission(token, MAINTENANCE_MODULE, 'VIEW');
    var items = Database.list('14_BAO_TRI', {}).items.filter(function (r) {
      return !Utils.isBlank(r.NGAY_THUC_HIEN) && String(r.KET_QUA || '').indexOf('Xác nhận:') === -1;
    });
    var deviceMap = {};
    Database.list('01_THIET_BI', {}).items.forEach(function (d) { deviceMap[d.ID] = d; });
    if (auth.scope.type !== 'ALL') {
      items = items.filter(function (r) { var d = deviceMap[r.THIET_BI_ID]; return d && auth.scope.departmentIds.indexOf(d.KHOA_PHONG_ID) !== -1; });
    }
    return items.map(function (r) {
      var d = deviceMap[r.THIET_BI_ID] || {};
      return { ID: r.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI, KET_QUA: r.KET_QUA };
    });
  },

  // ---- dùng chung ----
  _assertDeviceStatusIn_: function (device, allowedStatuses) {
    Utils.assert(allowedStatuses.indexOf(device.TRANG_THAI_QUAN_LY) !== -1, ERROR_CODES.VALIDATION_ERROR,
      'Thiết bị đang ở trạng thái "' + device.TRANG_THAI_QUAN_LY + '", không thể thực hiện bước này.');
  },

  _transitionDevice_: function (deviceId, newStatus, actor) {
    var before = Database.getById('01_THIET_BI', deviceId);
    Database.forceUpdateProtectedField_('01_THIET_BI', deviceId, { TRANG_THAI_QUAN_LY: newStatus }, actor);
    Database.appendAuditLog(actor, 'DEVICE_STATUS_CHANGE', '01_THIET_BI', deviceId,
      { TRANG_THAI_QUAN_LY: before.TRANG_THAI_QUAN_LY }, { TRANG_THAI_QUAN_LY: newStatus });
  }
};
