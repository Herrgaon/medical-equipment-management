/**
 * Tài liệu (22_TAI_LIEU) — mục 4.9 tài liệu thiết kế. Quản lý Google Drive: mỗi thiết bị có 1
 * thư mục riêng (01_THIET_BI.FOLDER_ID, tạo lười khi upload lần đầu — xem ghi chú tại Device.gs).
 * Mọi thao tác upload/xoá file đi qua đây (mục 6, dòng 409 tài liệu thiết kế) — không thao tác
 * trực tiếp trên Drive UI, để luôn ghi Audit và đồng bộ FILE_ID/FOLDER_ID vào Sheet.
 *
 * Dùng chung module quyền "Thiết bị & hồ sơ" (đã seed sẵn trong 26_QUYEN) — tài liệu là một phần
 * hồ sơ thiết bị, không phải module quyền riêng (tránh phải seed lại ma trận quyền cho 1 module
 * mới, việc mà seedInitialData() chỉ chạy đúng 1 lần theo thiết kế).
 *
 * Xoá tài liệu: đưa file vào Thùng rác Drive (setTrashed, có thể khôi phục trong 30 ngày) — KHÔNG
 * xoá dòng 22_TAI_LIEU (giữ đúng bất biến append-only), chỉ đánh dấu GHI_CHU để UI ẩn khỏi danh
 * sách đang hoạt động. Chỉ Super Admin có quyền Xoá theo ma trận đã seed (Quản lý thiết bị không
 * có QUYEN_XOA cho module này).
 */

var DOCUMENT_MODULE = 'Thiết bị & hồ sơ';
var DOCUMENT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — đủ cho file scan PDF/ảnh giấy tờ
var DOCUMENT_GROUPS = [
  'Catalogue / Hướng dẫn sử dụng',
  'Giấy phép nhập khẩu / lưu hành',
  'Chứng nhận kiểm định / hiệu chuẩn',
  'Giấy phép an toàn bức xạ',
  'Hồ sơ bảo hành',
  'Hoá đơn / Chứng từ mua sắm',
  'Khác'
];
var DOCUMENT_DELETED_MARK = '[ĐÃ XOÁ]';

var Document = {

  listActiveDevices: function (token) {
    var auth = Auth.assertPermission(token, DOCUMENT_MODULE, 'VIEW');
    var all = Database.list('01_THIET_BI', {}).items.filter(function (d) { return d.TRANG_THAI_QUAN_LY !== DEVICE_STATUS.DA_THANH_LY; });
    all = Device._applyScopeFilter_(all, auth.scope);
    return all.map(function (d) { return { ID: d.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI }; });
  },

  listByDevice: function (token, deviceId) {
    Auth.assertPermission(token, DOCUMENT_MODULE, 'VIEW');
    var rows = Database.list('22_TAI_LIEU', { filters: { THIET_BI_ID: deviceId } }).items
      .filter(function (r) { return String(r.GHI_CHU || '').indexOf(DOCUMENT_DELETED_MARK) !== 0; })
      .sort(function (a, b) { return new Date(b.NGAY_TAO) - new Date(a.NGAY_TAO); });
    return rows.map(function (r) {
      var url = '';
      try { url = DriveApp.getFileById(r.FILE_ID).getUrl(); } catch (e) { url = ''; }
      return {
        ID: r.ID, NHOM_TAI_LIEU: r.NHOM_TAI_LIEU, TEN_FILE: r.TEN_FILE, PHIEN_BAN: r.PHIEN_BAN,
        NGUOI_UPLOAD: r.NGUOI_UPLOAD, NGAY_TAO: r.NGAY_TAO, URL: url
      };
    });
  },

  _getOrCreateRootFolder_: function () {
    var props = PropertiesService.getScriptProperties();
    var rootId = props.getProperty('DOCUMENT_ROOT_FOLDER_ID');
    if (rootId) {
      try { return DriveApp.getFolderById(rootId); } catch (e) { /* ID cũ không còn hợp lệ, tạo lại */ }
    }
    var folder = DriveApp.createFolder('Ho so thiet bi y te - BVDK Dong Son');
    props.setProperty('DOCUMENT_ROOT_FOLDER_ID', folder.getId());
    return folder;
  },

  _getOrCreateDeviceFolder_: function (device, actor) {
    if (device.FOLDER_ID) {
      try { return DriveApp.getFolderById(device.FOLDER_ID); } catch (e) { /* bị xoá tay ngoài ý muốn, tạo lại bên dưới */ }
    }
    var root = this._getOrCreateRootFolder_();
    var folder = root.createFolder(device.MA_THIET_BI + ' - ' + device.TEN_THIET_BI);
    Database.updateRowById('01_THIET_BI', device.ID, { FOLDER_ID: folder.getId() }, actor);
    return folder;
  },

  uploadDocument: function (token, deviceId, nhomTaiLieu, fileName, base64Data) {
    var auth = Auth.assertPermission(token, DOCUMENT_MODULE, 'CREATE');
    var device = Database.getById('01_THIET_BI', deviceId);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị.');
    Utils.assert(DOCUMENT_GROUPS.indexOf(nhomTaiLieu) !== -1, ERROR_CODES.VALIDATION_ERROR, 'Nhóm tài liệu không hợp lệ.');
    Utils.assert(!Utils.isBlank(fileName), ERROR_CODES.VALIDATION_ERROR, 'Thiếu tên file.');
    Utils.assert(!Utils.isBlank(base64Data), ERROR_CODES.VALIDATION_ERROR, 'Thiếu dữ liệu file.');

    var bytes = Utilities.base64Decode(base64Data);
    Utils.assert(bytes.length <= DOCUMENT_MAX_FILE_BYTES, ERROR_CODES.VALIDATION_ERROR,
      'File vượt quá giới hạn ' + Math.round(DOCUMENT_MAX_FILE_BYTES / 1024 / 1024) + 'MB.');

    var blob = Utilities.newBlob(bytes, undefined, fileName);
    var folder = this._getOrCreateDeviceFolder_(device, auth.user.tenDangNhap);
    var file = folder.createFile(blob);

    var existingCount = Database.list('22_TAI_LIEU', { filters: { THIET_BI_ID: deviceId, NHOM_TAI_LIEU: nhomTaiLieu } }).items.length;

    var result = Database.insertRow('22_TAI_LIEU', {
      THIET_BI_ID: deviceId,
      NHOM_TAI_LIEU: nhomTaiLieu,
      TEN_FILE: fileName,
      FILE_ID: file.getId(),
      FOLDER_ID: folder.getId(),
      PHIEN_BAN: existingCount + 1,
      NGUOI_UPLOAD: auth.user.tenDangNhap
    }, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'UPLOAD_DOCUMENT', '22_TAI_LIEU', result.data.ID, null,
      { TEN_FILE: fileName, NHOM_TAI_LIEU: nhomTaiLieu });

    result.data.URL = file.getUrl();
    return result.data;
  },

  deleteDocument: function (token, docId) {
    var auth = Auth.assertPermission(token, DOCUMENT_MODULE, 'DELETE');
    var doc = Database.getById('22_TAI_LIEU', docId);
    Utils.assert(doc, ERROR_CODES.NOT_FOUND, 'Không tìm thấy tài liệu.');

    try { DriveApp.getFileById(doc.FILE_ID).setTrashed(true); } catch (e) { /* file có thể đã bị xoá tay từ trước, vẫn cho đóng dấu xoá trong hệ thống */ }

    var patch = { GHI_CHU: (DOCUMENT_DELETED_MARK + ' bởi ' + auth.user.tenDangNhap + ' lúc ' + Utils.nowIso() + '. ' + (doc.GHI_CHU || '')).trim() };
    Database.updateRowById('22_TAI_LIEU', docId, patch, auth.user.tenDangNhap);
    Database.appendAuditLog(auth.user.tenDangNhap, 'DELETE_DOCUMENT', '22_TAI_LIEU', docId, null, { TEN_FILE: doc.TEN_FILE });
    return { deleted: true };
  }
};
