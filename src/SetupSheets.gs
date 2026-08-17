/**
 * Bootstrap idempotent — CHỈ chạy tay từ Apps Script editor (function picker), KHÔNG gọi từ
 * Core.gs, KHÔNG reachable qua google.script.run/Web App.
 */

/**
 * Dọn dẹp 1 lần: xoá cột EMAIL còn sót trên 25_NGUOI_DUNG (từ bản thiết kế cũ trước khi chuyển
 * sang đăng nhập bằng TEN_DANG_NHAP, không còn dùng ở bất kỳ đâu trong code). Chạy tay 1 lần rồi
 * bỏ — không idempotent theo nghĩa "chạy nhiều lần vô hại cần thiết", nhưng chạy lại vẫn an toàn
 * (tự phát hiện cột đã xoá thì bỏ qua, không lỗi).
 */
function removeLegacyEmailColumn() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('25_NGUOI_DUNG');
  Utils.assert(sheet, ERROR_CODES.NOT_FOUND, 'Không tìm thấy sheet 25_NGUOI_DUNG.');

  var headerIndex = Database._getHeaderIndex_(sheet);
  var colIndex = headerIndex['EMAIL'];
  if (!colIndex) {
    Logger.log('Không còn cột EMAIL nào cần xoá trên 25_NGUOI_DUNG.');
    return;
  }
  sheet.deleteColumn(colIndex);
  Logger.log('Đã xoá cột EMAIL (vị trí cột ' + colIndex + ') khỏi 25_NGUOI_DUNG.');
}

/**
 * Dữ liệu danh mục MẪU để test CRUD thiết bị (Sprint 1.2) khi chưa có Admin UI nhập danh mục thật
 * (Sprint 1.4). MA/TEN đặt tiền tố "MAU-" / "(mẫu)" để không lẫn với danh mục thật của bệnh viện —
 * xoá tay các dòng này qua Sheet UI khi đã có danh mục thật, hàm này không tự dọn.
 */
function seedSampleCategories() {
  var actor = 'system-bootstrap';
  var samples = {
    '02_LOAI_THIET_BI': ['Máy chẩn đoán hình ảnh', 'Thiết bị hồi sức cấp cứu'],
    '03_NHOM_THIET_BI': ['Máy siêu âm', 'Máy thở'],
    '04_KHOA_PHONG': ['Khoa Dược - Vật tư, Thiết bị y tế', 'Khoa Hồi sức cấp cứu'],
    '05_VI_TRI': ['Phòng 101', 'Phòng 202'],
    '06_HANG_SAN_XUAT': ['Philips', 'GE Healthcare'],
    '07_NUOC_SAN_XUAT': ['Hà Lan', 'Mỹ'],
    '08_NHA_CUNG_CAP': ['Công ty TNHH Thiết bị Y tế ABC (mẫu)'],
    '09_NGUOI_PHU_TRACH': ['Nguyễn Văn A (mẫu)', 'Trần Thị B (mẫu)']
  };

  for (var tabName in samples) {
    var existing = Database.list(tabName, {}).items;
    if (existing.length > 0) {
      Logger.log(tabName + ': đã có dữ liệu, bỏ qua.');
      continue;
    }
    samples[tabName].forEach(function (ten) {
      Database.insertRow(tabName, { MA: 'MAU-' + ten.substring(0, 3).toUpperCase(), TEN: ten, TRANG_THAI: 'Hoạt động' }, actor);
    });
    Logger.log(tabName + ': đã seed ' + samples[tabName].length + ' dòng mẫu.');
  }
}

/**
 * Tạo đủ 36 Sheet nếu chưa có; nếu đã có, chỉ thêm cột thiếu vào CUỐI header (không xoá/sắp xếp
 * lại cột cũ, không đụng dữ liệu) — nhờ vậy chạy lại nhiều lần luôn an toàn, kể cả sau khi đã có
 * dữ liệu thật.
 */
function setupDatabase() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var report = { created: [], reconciled: [], driftColumns: {} };

    for (var i = 0; i < SCHEMA_REGISTRY.length; i++) {
      var entry = SCHEMA_REGISTRY[i];
      var expectedColumns = getFullColumns_(entry);
      var sheet = ss.getSheetByName(entry.tabName);

      if (!sheet) {
        // index > 36 (vd _SESSIONS = 99) là sheet hạ tầng, không thuộc thứ tự 36 sheet nghiệp vụ —
        // chèn ở cuối thay vì ép đúng vị trí (tránh insertSheet lỗi vì vị trí vượt số sheet hiện có).
        sheet = (entry.index <= 36) ? ss.insertSheet(entry.tabName, entry.index - 1) : ss.insertSheet(entry.tabName);
        sheet.getRange(1, 1, 1, expectedColumns.length).setValues([expectedColumns]);
        sheet.getRange(1, 1, 1, expectedColumns.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
        report.created.push(entry.tabName);
      } else {
        var drift = _reconcileHeaders_(sheet, expectedColumns);
        if (drift.added.length) report.reconciled.push(entry.tabName + ': +' + drift.added.join(','));
        if (drift.extra.length) report.driftColumns[entry.tabName] = drift.extra;
      }
    }

    _removeBlankDefaultSheet_(ss);

    var props = PropertiesService.getScriptProperties();
    props.setProperty('SETUP_LAST_RUN', Utils.nowIso());
    props.setProperty('SETUP_VERSION', String(SCHEMA_VERSION));

    Logger.log(JSON.stringify(report, null, 2));
    return report;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Thêm cột thiếu vào cuối; cột có sẵn trên sheet nhưng không có trong schema kỳ vọng thì GIỮ
 * NGUYÊN, chỉ báo cáo là "drift" — ưu tiên không bao giờ mất dữ liệu hơn là đúng tuyệt đối schema.
 */
function _reconcileHeaders_(sheet, expectedColumns) {
  var lastCol = sheet.getLastColumn();
  var existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var existingSet = {};
  for (var i = 0; i < existing.length; i++) existingSet[existing[i]] = true;

  var toAdd = [];
  for (var j = 0; j < expectedColumns.length; j++) {
    if (!existingSet[expectedColumns[j]]) toAdd.push(expectedColumns[j]);
  }
  if (toAdd.length) {
    sheet.getRange(1, lastCol + 1, 1, toAdd.length).setValues([toAdd]);
    sheet.getRange(1, lastCol + 1, 1, toAdd.length).setFontWeight('bold');
  }

  var expectedSet = {};
  for (var k = 0; k < expectedColumns.length; k++) expectedSet[expectedColumns[k]] = true;
  var extra = [];
  for (var m = 0; m < existing.length; m++) {
    if (existing[m] && !expectedSet[existing[m]]) extra.push(existing[m]);
  }

  return { added: toAdd, extra: extra };
}

/** Dọn sheet trắng mặc định ("Sheet1") khi tạo Spreadsheet mới — chỉ xoá nếu thật sự trống. */
function _removeBlankDefaultSheet_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var name = sh.getName();
    var isKnown = false;
    for (var j = 0; j < SCHEMA_REGISTRY.length; j++) {
      if (SCHEMA_REGISTRY[j].tabName === name) { isKnown = true; break; }
    }
    if (!isKnown && sh.getLastRow() === 0 && sh.getLastColumn() === 0 && sheets.length > 1) {
      ss.deleteSheet(sh);
    }
  }
}

/**
 * Seed ma trận quyền 6 vai trò (mục 5 tài liệu thiết kế) + đúng 1 dòng Super Admin đầu tiên.
 * Có guard BOOTSTRAP_COMPLETED — chỉ chạy 1 lần; muốn chạy lại phải tự tay xoá Script Property
 * (đòi hỏi quyền truy cập project Apps Script, đã là ranh giới tin cậy cao).
 *
 * CỐ TÌNH không xuất hiện trong Core.gs: đây là hàm DUY NHẤT có thể tạo Super Admin, nên chỉ
 * chạy được từ editor, không thể gọi qua mạng/web app — đây là kiểm soát cụ thể cho yêu cầu
 * "không có cổng sau admin ẩn nào reachable từ bên ngoài".
 *
 * Không nhận tham số (Apps Script editor "Run" không có ô nhập tham số) — đọc thông tin admin từ
 * Script Property (INITIAL_ADMIN_USERNAME/INITIAL_ADMIN_PASSWORD), tự đặt tay 1 lần trong
 * Project Settings > Script Properties trước khi chạy. KHÔNG hardcode thông tin đăng nhập trong
 * code để tránh lộ vào Git.
 */
function seedInitialData() {
  var props = PropertiesService.getScriptProperties();
  var initialAdminUsername = props.getProperty('INITIAL_ADMIN_USERNAME');
  var initialAdminPassword = props.getProperty('INITIAL_ADMIN_PASSWORD');
  Utils.assert(!Utils.isBlank(initialAdminUsername), ERROR_CODES.VALIDATION_ERROR,
    'Chưa đặt Script Property INITIAL_ADMIN_USERNAME. Vào Project Settings > Script Properties để thêm trước khi chạy.');
  Utils.assert(!Utils.isBlank(initialAdminPassword), ERROR_CODES.VALIDATION_ERROR,
    'Chưa đặt Script Property INITIAL_ADMIN_PASSWORD. Vào Project Settings > Script Properties để thêm trước khi chạy.');

  if (props.getProperty('BOOTSTRAP_COMPLETED') === 'true') {
    Logger.log('Đã seed dữ liệu ban đầu trước đó — bỏ qua. Xoá Script Property BOOTSTRAP_COMPLETED nếu muốn chạy lại.');
    return;
  }

  var actor = 'system-bootstrap';
  var existingRoles = Database.list('26_QUYEN', {}).items;
  if (existingRoles.length === 0) {
    _seedPermissionMatrix_(actor);
  }

  var normalizedUsername = String(initialAdminUsername).trim();
  var superAdminRole = Database.findOne('26_QUYEN', { VAI_TRO: ROLES.SUPER_ADMIN });

  var userRow = Database.findOne('25_NGUOI_DUNG', { TEN_DANG_NHAP: normalizedUsername });
  if (!userRow && superAdminRole) {
    // Nếu đã có đúng 1 dòng Super Admin tạo từ bản code cũ (trước khi có TEN_DANG_NHAP, còn trống
    // ở cột này) — coi đó là dòng cần gán tên đăng nhập, tránh tạo trùng dòng admin mới. Không
    // hardcode giá trị cụ thể nào — chỉ dựa vào việc TEN_DANG_NHAP đang trống.
    var legacyAdmins = Database.list('25_NGUOI_DUNG', { filters: { VAI_TRO_ID: superAdminRole.ID } }).items
      .filter(function (u) { return Utils.isBlank(u.TEN_DANG_NHAP); });
    if (legacyAdmins.length === 1) userRow = legacyAdmins[0];
  }

  if (!userRow) {
    Database.insertRow('25_NGUOI_DUNG', {
      TEN_DANG_NHAP: normalizedUsername,
      HO_TEN: 'Quản trị hệ thống (khởi tạo)',
      VAI_TRO_ID: superAdminRole ? superAdminRole.ID : '',
      KHOA_PHONG_PHU_TRACH: '',
      TRANG_THAI: 'Đang hoạt động'
    }, actor);
    userRow = Database.findOne('25_NGUOI_DUNG', { TEN_DANG_NHAP: normalizedUsername });
  } else if (userRow.TEN_DANG_NHAP !== normalizedUsername) {
    Database.updateRowById('25_NGUOI_DUNG', userRow.ID, { TEN_DANG_NHAP: normalizedUsername }, actor);
    userRow.TEN_DANG_NHAP = normalizedUsername;
  }
  Auth.setPassword_(userRow, initialAdminPassword, actor);

  // Xoá mật khẩu plaintext khỏi Script Properties ngay sau khi dùng — không để nó tồn tại lâu
  // hơn mức cần thiết ở bất kỳ đâu, kể cả nơi chỉ có developer truy cập được.
  props.deleteProperty('INITIAL_ADMIN_PASSWORD');
  props.setProperty('BOOTSTRAP_COMPLETED', 'true');
  Logger.log('Seed dữ liệu ban đầu hoàn tất cho tên đăng nhập ' + normalizedUsername);
}

/**
 * Transcribe ma trận phân quyền mục 5 tài liệu thiết kế. Mỗi dòng: 1 vai trò x 1 module.
 * X=Xem, T=Tạo, S=Sửa, D=Duyệt, Xo=Xoá, K=Khoá — map sang QUYEN_XEM/TAO/SUA/DUYET/XOA/KHOA.
 */
function _seedPermissionMatrix_(actor) {
  var MODULES = {
    CATEGORY: 'Danh mục & cấu hình',
    DEVICE: 'Thiết bị & hồ sơ',
    RECEIPT: 'Tiếp nhận/Nghiệm thu/Bàn giao',
    WARRANTY_MAINT: 'Bảo hành/Bảo trì/Kiểm định/Hiệu chuẩn',
    RADIATION: 'Bức xạ / Phòng XQ-CT',
    INCIDENT: 'Sự cố/Sửa chữa/Downtime/Phụ tùng',
    TRANSFER: 'Điều chuyển/Kiểm kê',
    COMPLIANCE: 'An toàn/thu hồi, Đào tạo, Khắc phục audit',
    LIQUIDATION: 'Thanh lý',
    ALERT: 'Cảnh báo & Công việc',
    REPORT: 'Báo cáo/Phân tích/Xuất hồ sơ',
    USER_ADMIN: 'Người dùng & phân quyền',
    AUDIT: 'Audit log',
    IMPORT_BACKUP: 'Import Excel / Backup'
  };
  // { X, T, S, D, Xo, K }
  var FULL = { X: true, T: true, S: true, D: true, Xo: true, K: true };
  var rows = [];

  function rule(vaiTro, module, perms) {
    rows.push({
      VAI_TRO: vaiTro, MODULE: module,
      QUYEN_XEM: !!perms.X, QUYEN_TAO: !!perms.T, QUYEN_SUA: !!perms.S,
      QUYEN_DUYET: !!perms.D, QUYEN_XOA: !!perms.Xo, QUYEN_KHOA: !!perms.K
    });
  }

  // Super Admin: toàn quyền mọi module (mục 5, cột 1).
  for (var m in MODULES) rule(ROLES.SUPER_ADMIN, MODULES[m], FULL);

  // Quản lý thiết bị.
  rule(ROLES.DEVICE_MANAGER, MODULES.CATEGORY, { X: true });
  rule(ROLES.DEVICE_MANAGER, MODULES.DEVICE, { X: true, T: true, S: true, K: true });
  rule(ROLES.DEVICE_MANAGER, MODULES.RECEIPT, { X: true, T: true, S: true, D: true });
  rule(ROLES.DEVICE_MANAGER, MODULES.WARRANTY_MAINT, { X: true, T: true, S: true, D: true });
  rule(ROLES.DEVICE_MANAGER, MODULES.RADIATION, { X: true, T: true, S: true, D: true });
  rule(ROLES.DEVICE_MANAGER, MODULES.INCIDENT, { X: true, T: true, S: true, D: true });
  rule(ROLES.DEVICE_MANAGER, MODULES.TRANSFER, { X: true, T: true, S: true, D: true });
  rule(ROLES.DEVICE_MANAGER, MODULES.COMPLIANCE, { X: true, T: true, S: true, D: true });
  rule(ROLES.DEVICE_MANAGER, MODULES.LIQUIDATION, { X: true, T: true, D: true });
  rule(ROLES.DEVICE_MANAGER, MODULES.ALERT, { X: true, T: true, S: true, K: true });
  rule(ROLES.DEVICE_MANAGER, MODULES.REPORT, { X: true });
  rule(ROLES.DEVICE_MANAGER, MODULES.IMPORT_BACKUP, { X: true, T: true });

  // Kỹ thuật viên.
  rule(ROLES.TECHNICIAN, MODULES.CATEGORY, { X: true });
  rule(ROLES.TECHNICIAN, MODULES.DEVICE, { X: true });
  rule(ROLES.TECHNICIAN, MODULES.RECEIPT, { X: true });
  rule(ROLES.TECHNICIAN, MODULES.WARRANTY_MAINT, { X: true, T: true, S: true });
  rule(ROLES.TECHNICIAN, MODULES.RADIATION, { X: true, T: true, S: true });
  rule(ROLES.TECHNICIAN, MODULES.INCIDENT, { X: true, T: true, S: true });
  rule(ROLES.TECHNICIAN, MODULES.TRANSFER, { X: true });
  rule(ROLES.TECHNICIAN, MODULES.COMPLIANCE, { X: true, T: true, S: true });
  rule(ROLES.TECHNICIAN, MODULES.ALERT, { X: true, S: true });
  rule(ROLES.TECHNICIAN, MODULES.REPORT, { X: true });

  // Khoa/phòng.
  rule(ROLES.DEPARTMENT, MODULES.DEVICE, { X: true });
  rule(ROLES.DEPARTMENT, MODULES.RECEIPT, { X: true, D: true });
  rule(ROLES.DEPARTMENT, MODULES.WARRANTY_MAINT, { X: true });
  rule(ROLES.DEPARTMENT, MODULES.RADIATION, { X: true });
  rule(ROLES.DEPARTMENT, MODULES.INCIDENT, { X: true, T: true });
  rule(ROLES.DEPARTMENT, MODULES.TRANSFER, { X: true, T: true, D: true });
  rule(ROLES.DEPARTMENT, MODULES.COMPLIANCE, { X: true });
  rule(ROLES.DEPARTMENT, MODULES.ALERT, { X: true });
  rule(ROLES.DEPARTMENT, MODULES.REPORT, { X: true });

  // Lãnh đạo.
  rule(ROLES.LEADERSHIP, MODULES.CATEGORY, { X: true });
  rule(ROLES.LEADERSHIP, MODULES.DEVICE, { X: true });
  rule(ROLES.LEADERSHIP, MODULES.RECEIPT, { X: true, D: true });
  rule(ROLES.LEADERSHIP, MODULES.WARRANTY_MAINT, { X: true, D: true });
  rule(ROLES.LEADERSHIP, MODULES.RADIATION, { X: true, D: true });
  rule(ROLES.LEADERSHIP, MODULES.INCIDENT, { X: true, D: true });
  rule(ROLES.LEADERSHIP, MODULES.TRANSFER, { X: true, D: true });
  rule(ROLES.LEADERSHIP, MODULES.COMPLIANCE, { X: true, D: true });
  rule(ROLES.LEADERSHIP, MODULES.LIQUIDATION, { D: true });
  rule(ROLES.LEADERSHIP, MODULES.ALERT, { X: true });
  rule(ROLES.LEADERSHIP, MODULES.REPORT, { X: true });
  rule(ROLES.LEADERSHIP, MODULES.USER_ADMIN, { X: true });
  rule(ROLES.LEADERSHIP, MODULES.AUDIT, { X: true });
  rule(ROLES.LEADERSHIP, MODULES.IMPORT_BACKUP, { X: true });

  // Người xem — chỉ xem, mọi module còn lại (trừ User admin/Audit không có quyền gì theo mục 5).
  for (var mm in MODULES) {
    if (MODULES[mm] === MODULES.USER_ADMIN || MODULES[mm] === MODULES.AUDIT || MODULES[mm] === MODULES.IMPORT_BACKUP) continue;
    rule(ROLES.VIEWER, MODULES[mm], { X: true });
  }

  for (var i = 0; i < rows.length; i++) {
    Database.insertRow('26_QUYEN', rows[i], actor);
  }
}
