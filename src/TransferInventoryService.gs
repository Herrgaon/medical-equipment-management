/**
 * Điều chuyển (21_DIEU_CHUYEN) + Kiểm kê (24_KIEM_KE) — mục 4.7, 6.1, 6.4 tài liệu thiết kế.
 * Gộp 1 file đúng theo nhóm "Vị trí & kiểm soát vật lý" của tài liệu thiết kế (mục 0, khối G).
 */

var TRANSFER_INVENTORY_MODULE = 'Điều chuyển/Kiểm kê';

var TransferInventory = {

  listActiveDevices: function (token) {
    var auth = Auth.assertPermission(token, TRANSFER_INVENTORY_MODULE, 'VIEW');
    var all = Database.list('01_THIET_BI', {}).items.filter(function (d) { return d.TRANG_THAI_QUAN_LY !== DEVICE_STATUS.DA_THANH_LY; });
    all = Device._applyScopeFilter_(all, auth.scope);
    return all.map(function (d) {
      return { ID: d.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI, TRANG_THAI_QUAN_LY: d.TRANG_THAI_QUAN_LY, KHOA_PHONG_ID: d.KHOA_PHONG_ID, VI_TRI_ID: d.VI_TRI_ID };
    });
  },

  // ---- Điều chuyển: Tạo yêu cầu -> Duyệt -> Xác nhận đã bàn giao (giống mẫu Lifecycle/Handover) ----

  createTransfer: function (token, deviceId, data) {
    var auth = Auth.assertPermission(token, TRANSFER_INVENTORY_MODULE, 'CREATE');
    var device = Database.getById('01_THIET_BI', deviceId);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị.');
    Utils.assert(device.TRANG_THAI_QUAN_LY === DEVICE_STATUS.DANG_SU_DUNG || device.TRANG_THAI_QUAN_LY === DEVICE_STATUS.TAM_NGUNG_SU_DUNG,
      ERROR_CODES.VALIDATION_ERROR, 'Chỉ điều chuyển được thiết bị đang sử dụng hoặc tạm ngừng sử dụng.');
    Utils.assert(!Utils.isBlank(data.KHOA_PHONG_MOI_ID), ERROR_CODES.VALIDATION_ERROR, 'Thiếu khoa/phòng mới.');

    var result = Database.insertRow('21_DIEU_CHUYEN', {
      THIET_BI_ID: deviceId,
      KHOA_PHONG_CU_ID: device.KHOA_PHONG_ID,
      KHOA_PHONG_MOI_ID: data.KHOA_PHONG_MOI_ID,
      VI_TRI_CU_ID: device.VI_TRI_ID,
      VI_TRI_MOI_ID: data.VI_TRI_MOI_ID || '',
      LY_DO: data.LY_DO || '',
      NGUOI_DUYET: '',
      TRANG_THAI: 'Chờ duyệt'
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'CREATE_TRANSFER', '21_DIEU_CHUYEN', result.data.ID, null, result.data);
    return result.data;
  },

  approveTransfer: function (token, transferId) {
    var auth = Auth.assertPermission(token, TRANSFER_INVENTORY_MODULE, 'APPROVE');
    var transfer = Database.getById('21_DIEU_CHUYEN', transferId);
    Utils.assert(transfer, ERROR_CODES.NOT_FOUND, 'Không tìm thấy yêu cầu điều chuyển.');
    Utils.assert(transfer.TRANG_THAI === 'Chờ duyệt', ERROR_CODES.VALIDATION_ERROR, 'Yêu cầu này không ở trạng thái chờ duyệt.');

    Database.updateRowById('21_DIEU_CHUYEN', transferId, { TRANG_THAI: 'Đã duyệt', NGUOI_DUYET: auth.user.tenDangNhap }, auth.user.tenDangNhap);
    this._transitionDevice_(transfer.THIET_BI_ID, DEVICE_STATUS.CHO_DIEU_CHUYEN, auth.user.tenDangNhap);
    return { approved: true };
  },

  /** Khoa/phòng mới xác nhận đã nhận thiết bị — hoàn tất điều chuyển, cập nhật vị trí thật. */
  confirmTransferReceived: function (token, transferId) {
    var auth = Auth.assertPermission(token, TRANSFER_INVENTORY_MODULE, 'APPROVE');
    var transfer = Database.getById('21_DIEU_CHUYEN', transferId);
    Utils.assert(transfer, ERROR_CODES.NOT_FOUND, 'Không tìm thấy yêu cầu điều chuyển.');
    Utils.assert(transfer.TRANG_THAI === 'Đã duyệt', ERROR_CODES.VALIDATION_ERROR, 'Yêu cầu chưa được duyệt.');

    Database.updateRowById('21_DIEU_CHUYEN', transferId, { TRANG_THAI: 'Đã bàn giao' }, auth.user.tenDangNhap);
    var before = Database.getById('01_THIET_BI', transfer.THIET_BI_ID);
    Database.forceUpdateProtectedField_('01_THIET_BI', transfer.THIET_BI_ID, {
      TRANG_THAI_QUAN_LY: DEVICE_STATUS.DANG_SU_DUNG,
      KHOA_PHONG_ID: transfer.KHOA_PHONG_MOI_ID,
      VI_TRI_ID: transfer.VI_TRI_MOI_ID || before.VI_TRI_ID
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'DEVICE_STATUS_CHANGE', '01_THIET_BI', transfer.THIET_BI_ID,
      { TRANG_THAI_QUAN_LY: before.TRANG_THAI_QUAN_LY }, { TRANG_THAI_QUAN_LY: DEVICE_STATUS.DANG_SU_DUNG });
    return { confirmed: true };
  },

  listTransfersByDevice: function (token, deviceId) {
    Auth.assertPermission(token, TRANSFER_INVENTORY_MODULE, 'VIEW');
    return Database.list('21_DIEU_CHUYEN', { filters: { THIET_BI_ID: deviceId } }).items
      .sort(function (a, b) { return new Date(b.NGAY_TAO) - new Date(a.NGAY_TAO); });
  },

  listPendingTransfers: function (token, stage) {
    var auth = Auth.assertPermission(token, TRANSFER_INVENTORY_MODULE, 'VIEW');
    var status = (stage === 'APPROVE') ? 'Chờ duyệt' : 'Đã duyệt';
    var pending = Database.list('21_DIEU_CHUYEN', { filters: { TRANG_THAI: status } }).items;
    var deviceMap = {};
    Database.list('01_THIET_BI', {}).items.forEach(function (d) { deviceMap[d.ID] = d; });
    if (auth.scope.type !== 'ALL') {
      pending = pending.filter(function (t) { return auth.scope.departmentIds.indexOf(t.KHOA_PHONG_MOI_ID) !== -1 || auth.scope.departmentIds.indexOf(t.KHOA_PHONG_CU_ID) !== -1; });
    }
    return pending.map(function (t) {
      var d = deviceMap[t.THIET_BI_ID] || {};
      return { ID: t.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI, LY_DO: t.LY_DO };
    });
  },

  // ---- Kiểm kê ----

  /** Tạo mã đợt kiểm kê mới — không có sheet "phiên" riêng, chỉ là 1 ID dùng chung cho nhiều dòng quét. */
  startInventorySession: function (token) {
    var auth = Auth.assertPermission(token, TRANSFER_INVENTORY_MODULE, 'CREATE');
    var sessionId = Database._withLock_(function () { return Database._generateId_('INV-'); });
    Database.appendAuditLog(auth.user.tenDangNhap, 'START_INVENTORY_SESSION', '24_KIEM_KE', sessionId, null, null);
    return { sessionId: sessionId };
  },

  scanDevice: function (token, sessionId, deviceId, data) {
    var auth = Auth.assertPermission(token, TRANSFER_INVENTORY_MODULE, 'CREATE');
    var device = Database.getById('01_THIET_BI', deviceId);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị.');
    Utils.assert(['Có mặt', 'Không tìm thấy', 'Sai vị trí', 'Đang sửa chữa', 'Đã điều chuyển', 'Khác'].indexOf(data.KET_QUA) !== -1,
      ERROR_CODES.VALIDATION_ERROR, 'Kết quả kiểm kê không hợp lệ.');

    var result = Database.insertRow('24_KIEM_KE', {
      THIET_BI_ID: deviceId,
      DOT_KIEM_KE_ID: sessionId,
      NGAY_QUET: Utils.nowIso(),
      NGUOI_QUET_ID: auth.user.tenDangNhap,
      VI_TRI_QUET: data.VI_TRI_QUET || '',
      KET_QUA: data.KET_QUA
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'INVENTORY_SCAN', '24_KIEM_KE', result.data.ID, null, result.data);

    // Đối chiếu tự động đơn giản: báo chênh lệch nếu vị trí quét khác vị trí ghi trong hệ thống.
    var mismatch = !Utils.isBlank(data.VI_TRI_QUET) && data.VI_TRI_QUET !== device.VI_TRI_ID;
    return Object.assign({}, result.data, { locationMismatch: mismatch, expectedViTriId: device.VI_TRI_ID });
  },

  getSessionResults: function (token, sessionId) {
    Auth.assertPermission(token, TRANSFER_INVENTORY_MODULE, 'VIEW');
    var rows = Database.list('24_KIEM_KE', { filters: { DOT_KIEM_KE_ID: sessionId } }).items;
    var deviceMap = {};
    Database.list('01_THIET_BI', {}).items.forEach(function (d) { deviceMap[d.ID] = d; });
    return rows.map(function (r) {
      var d = deviceMap[r.THIET_BI_ID] || {};
      return {
        ID: r.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI,
        KET_QUA: r.KET_QUA, VI_TRI_QUET: r.VI_TRI_QUET, NGAY_QUET: r.NGAY_QUET
      };
    }).sort(function (a, b) { return new Date(b.NGAY_QUET) - new Date(a.NGAY_QUET); });
  },

  _transitionDevice_: function (deviceId, newStatus, actor) {
    var before = Database.getById('01_THIET_BI', deviceId);
    Database.forceUpdateProtectedField_('01_THIET_BI', deviceId, { TRANG_THAI_QUAN_LY: newStatus }, actor);
    Database.appendAuditLog(actor, 'DEVICE_STATUS_CHANGE', '01_THIET_BI', deviceId,
      { TRANG_THAI_QUAN_LY: before.TRANG_THAI_QUAN_LY }, { TRANG_THAI_QUAN_LY: newStatus });
  }
};
