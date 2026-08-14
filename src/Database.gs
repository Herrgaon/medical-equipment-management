/**
 * Repository layer — file DUY NHẤT được gọi SpreadsheetApp/DriveApp (bất biến kiến trúc, xem CLAUDE.md).
 * Khi chuyển sang SQL sau này, chỉ cần viết lại file này.
 */

var Database = {

  _getSpreadsheet_: function () {
    // Container-bound script -> luôn đúng Spreadsheet 36-sheet của dự án, kể cả khi chạy qua
    // trigger/web app/editor.
    return SpreadsheetApp.getActiveSpreadsheet();
  },

  _getSheet_: function (tabName) {
    var sheet = this._getSpreadsheet_().getSheetByName(tabName);
    Utils.assert(sheet, ERROR_CODES.NOT_FOUND, 'Không tìm thấy sheet: ' + tabName);
    return sheet;
  },

  /**
   * Map tên cột -> chỉ số cột (1-based), đọc từ hàng header thật của Sheet — KHÔNG giả định
   * trùng thứ tự với SCHEMA_REGISTRY. Nhờ vậy việc thêm cột mới ở cuối (xem SetupSheets.gs)
   * không bao giờ làm lệch dữ liệu cũ.
   */
  _getHeaderIndex_: function (sheet) {
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) return {};
    var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var map = {};
    for (var i = 0; i < headerRow.length; i++) {
      if (headerRow[i]) map[headerRow[i]] = i + 1;
    }
    return map;
  },

  /** Map ID (cột A) -> số dòng thật. Chỉ đúng vì dữ liệu là append-only, không xoá/sắp xếp lại dòng. */
  _getRowIndexMap_: function (tabName) {
    var cacheKey = 'idx_' + tabName;
    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    var sheet = this._getSheet_(tabName);
    var lastRow = sheet.getLastRow();
    var map = {};
    if (lastRow >= 2) {
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (ids[i][0]) map[ids[i][0]] = i + 2;
      }
    }
    // Giới hạn CacheService ~100KB/giá trị — ở quy mô vài trăm thiết bị (mục tiêu Giai đoạn 1)
    // map này chỉ vài KB. Nếu số dòng tăng lên hàng nghìn, cần đánh index theo cách khác.
    try {
      cache.put(cacheKey, JSON.stringify(map), 21600);
    } catch (e) {
      // Vượt giới hạn cache -> bỏ qua cache, lần đọc sau tự quét lại. Không phải lỗi nghiêm trọng.
    }
    return map;
  },

  _invalidateRowIndex_: function (tabName) {
    CacheService.getScriptCache().remove('idx_' + tabName);
  },

  _invalidateCategoryCache_: function (tabName) {
    CacheService.getScriptCache().remove('cat_' + tabName);
  },

  /**
   * Sinh ID mới, an toàn khi nhiều người gọi đồng thời. Bộ đếm lưu trong Script Properties
   * (không quét Sheet tìm max — đó là nguồn race điều kiện: hai lệnh gọi đồng thời có thể đọc
   * cùng 1 giá trị max và sinh trùng ID). Hàm này là private (gạch dưới) — LUÔN phải gọi sau khi
   * đã giữ được LockService, không tự gọi độc lập.
   */
  _generateId_: function (prefix) {
    var props = PropertiesService.getScriptProperties();
    var key = 'SEQ_' + prefix;
    var next = (parseInt(props.getProperty(key), 10) || 0) + 1;
    props.setProperty(key, String(next));
    var padded = ('' + next);
    while (padded.length < ID_SEQUENCE_WIDTH) padded = '0' + padded;
    return prefix + padded;
  },

  /**
   * Sinh MA_THIET_BI dạng TB-YYYY-NNNNNN. Bộ đếm reset theo năm (đọc tự nhiên nhất theo tên cột) —
   * CHƯA được bệnh viện xác nhận (mục 14 tài liệu thiết kế), cần chốt lại trước khi bàn giao chính thức.
   */
  _generateDeviceCode_: function () {
    var year = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy');
    var props = PropertiesService.getScriptProperties();
    var key = 'SEQ_TB_' + year;
    var next = (parseInt(props.getProperty(key), 10) || 0) + 1;
    props.setProperty(key, String(next));
    var padded = ('' + next);
    while (padded.length < ID_SEQUENCE_WIDTH) padded = '0' + padded;
    return 'TB-' + year + '-' + padded;
  },

  _withLock_: function (fn) {
    var lock = LockService.getScriptLock();
    try {
      // Khoá toàn script (không phải theo user/document) — tính duy nhất của ID phải đúng
      // giữa MỌI người dùng đồng thời, không chỉ trong 1 phiên.
      lock.waitLock(15000);
    } catch (e) {
      throw new AppError(ERROR_CODES.LOCK_TIMEOUT, 'Hệ thống đang bận, vui lòng thử lại.');
    }
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  },

  insertRow: function (tabName, dataObject, actor) {
    var entry = getSchemaEntry_(tabName);
    var self = this;
    return this._withLock_(function () {
      var sheet = self._getSheet_(tabName);
      var headerIndex = self._getHeaderIndex_(sheet);
      var now = Utils.nowIso();

      var row = Object.assign({}, dataObject);
      // ID tự sinh theo bộ đếm tuần tự, TRỪ KHI caller đã cung cấp sẵn (vd token phiên _SESSIONS —
      // phải ngẫu nhiên không đoán được, không được dùng bộ đếm tuần tự).
      if (!row.ID) {
        row.ID = self._generateId_(entry.idPrefix);
      }

      if (entry.template === 'BUSINESS' || entry.template === 'CATEGORY' || entry.template === 'PEOPLE' || entry.template === 'PERMISSION') {
        if (headerIndex.hasOwnProperty('NGAY_TAO')) { row.NGAY_TAO = now; row.NGUOI_TAO = actor; }
        if (headerIndex.hasOwnProperty('CREATED_AT')) { row.CREATED_AT = now; row.CREATED_BY = actor; }
      }
      if (tabName === '28_AUDIT_LOG') {
        row.THOI_GIAN = now;
      }

      var lastCol = sheet.getLastColumn();
      var newRowValues = new Array(lastCol).fill('');
      for (var colName in headerIndex) {
        if (row.hasOwnProperty(colName)) {
          newRowValues[headerIndex[colName] - 1] = Utils.sanitizeCellValue(row[colName]);
        }
      }
      sheet.appendRow(newRowValues);
      self._invalidateRowIndex_(tabName);
      self._invalidateCategoryCache_(tabName);
      return Utils.success(row);
    });
  },

  updateRowById: function (tabName, id, patchObject, actor) {
    var protectedFields = PROTECTED_FIELDS[tabName] || [];
    for (var i = 0; i < protectedFields.length; i++) {
      if (patchObject.hasOwnProperty(protectedFields[i])) {
        throw new AppError(ERROR_CODES.PROTECTED_FIELD,
          'Trường ' + protectedFields[i] + ' chỉ được đổi qua hàm nghiệp vụ chuyên biệt.');
      }
    }
    return this._updateRowByIdInternal_(tabName, id, patchObject, actor);
  },

  /**
   * Lối thoát có kiểm soát duy nhất để ghi field bị bảo vệ (vd TRANG_THAI_QUAN_LY qua state machine).
   * Tên hàm cố tình dài/rõ ràng để không ai vô tình gọi nhầm. Chỉ Device.gs (Sprint 1.2) được gọi.
   */
  forceUpdateProtectedField_: function (tabName, id, patchObject, actor) {
    return this._updateRowByIdInternal_(tabName, id, patchObject, actor);
  },

  _updateRowByIdInternal_: function (tabName, id, patchObject, actor) {
    var self = this;
    return this._withLock_(function () {
      var sheet = self._getSheet_(tabName);
      var headerIndex = self._getHeaderIndex_(sheet);
      var rowMap = self._getRowIndexMap_(tabName);
      var rowNumber = rowMap[id];
      Utils.assert(rowNumber, ERROR_CODES.NOT_FOUND, 'Không tìm thấy bản ghi: ' + id);

      var now = Utils.nowIso();
      var patch = Object.assign({}, patchObject);
      if (headerIndex.hasOwnProperty('NGAY_CAP_NHAT')) { patch.NGAY_CAP_NHAT = now; patch.NGUOI_CAP_NHAT = actor; }
      if (headerIndex.hasOwnProperty('UPDATED_AT')) { patch.UPDATED_AT = now; patch.UPDATED_BY = actor; }

      for (var colName in patch) {
        if (headerIndex.hasOwnProperty(colName)) {
          sheet.getRange(rowNumber, headerIndex[colName]).setValue(Utils.sanitizeCellValue(patch[colName]));
        }
      }
      self._invalidateCategoryCache_(tabName);
      return Utils.success({ id: id });
    });
  },

  getById: function (tabName, id) {
    var sheet = this._getSheet_(tabName);
    var headerIndex = this._getHeaderIndex_(sheet);
    var rowMap = this._getRowIndexMap_(tabName);
    var rowNumber = rowMap[id];
    if (!rowNumber) return null;
    return this._rowToObject_(sheet, rowNumber, headerIndex);
  },

  findOne: function (tabName, matchObject) {
    var results = this.list(tabName, { filters: matchObject, page: 1, pageSize: 1 });
    return results.items.length ? results.items[0] : null;
  },

  /**
   * Đọc toàn sheet + lọc/phân trang trong bộ nhớ. Đủ dùng ở quy mô hàng trăm/thấp hàng nghìn dòng
   * (mục tiêu Giai đoạn 1: tối thiểu 200 thiết bị). Nếu khối lượng dữ liệu tăng nhiều, đây là nơi
   * đầu tiên cần xem lại (ví dụ thêm sheet chỉ mục hoặc chuyển sang SQL như kiến trúc đã dự phòng).
   */
  list: function (tabName, options) {
    options = options || {};
    var sheet = this._getSheet_(tabName);
    var headerIndex = this._getHeaderIndex_(sheet);
    var lastRow = sheet.getLastRow();
    var items = [];
    if (lastRow >= 2) {
      var lastCol = sheet.getLastColumn();
      var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (var i = 0; i < values.length; i++) {
        var obj = {};
        for (var colName in headerIndex) {
          obj[colName] = values[i][headerIndex[colName] - 1];
        }
        if (!obj.ID) continue;
        if (this._matchesFilters_(obj, options.filters)) items.push(obj);
      }
    }
    var total = items.length;
    var page = options.page || 1;
    var pageSize = options.pageSize || total || 1;
    var start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total: total, page: page, pageSize: pageSize };
  },

  _matchesFilters_: function (obj, filters) {
    if (!filters) return true;
    for (var key in filters) {
      if (obj[key] !== filters[key]) return false;
    }
    return true;
  },

  _rowToObject_: function (sheet, rowNumber, headerIndex) {
    var lastCol = sheet.getLastColumn();
    var values = sheet.getRange(rowNumber, 1, 1, lastCol).getValues()[0];
    var obj = {};
    for (var colName in headerIndex) {
      obj[colName] = values[headerIndex[colName] - 1];
    }
    return obj;
  },

  /** Đọc toàn bộ 1 sheet danh mục, cache dùng chung cho mọi user (dữ liệu danh mục giống nhau). */
  getCategoryData: function (tabName) {
    var cacheKey = 'cat_' + tabName;
    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    var result = this.list(tabName, {}).items;
    try {
      cache.put(cacheKey, JSON.stringify(result), 21600);
    } catch (e) {
      // Vượt giới hạn cache -> bỏ qua, không chặn luồng chính.
    }
    return result;
  },

  /**
   * Ghi audit log — 28_AUDIT_LOG KHÔNG có hàm update/delete nào trong toàn bộ Database.gs.
   * Đây là chặn ở tầng code, không phải chỉ chặn bằng quyền: kể cả Super Admin cũng không có
   * đường gọi nào sửa được lịch sử, vì hàm đó không tồn tại.
   */
  appendAuditLog: function (actor, action, targetType, targetId, before, after) {
    return this.insertRow('28_AUDIT_LOG', {
      NGUOI_THUC_HIEN: actor,
      HANH_DONG: action,
      DOI_TUONG_LOAI: targetType,
      DOI_TUONG_ID: targetId,
      GIA_TRI_TRUOC: before ? JSON.stringify(before) : '',
      GIA_TRI_SAU: after ? JSON.stringify(after) : ''
    }, actor);
  },

  /**
   * Xoá dòng theo ID — CHỈ cho phép trên '_SESSIONS' (dữ liệu kỹ thuật tạm thời, đăng xuất/hết hạn).
   * Không phải hàm xoá chung: dữ liệu nghiệp vụ trong 36 sheet chính không bao giờ bị xoá cứng
   * (bất biến kiến trúc, xem CLAUDE.md) — assert dưới đây chặn cứng việc dùng nhầm hàm này cho sheet khác.
   */
  deleteSessionRow_: function (id) {
    var tabName = '_SESSIONS';
    var self = this;
    return this._withLock_(function () {
      var sheet = self._getSheet_(tabName);
      var rowMap = self._getRowIndexMap_(tabName);
      var rowNumber = rowMap[id];
      if (!rowNumber) return Utils.success({ deleted: false });
      sheet.deleteRow(rowNumber);
      self._invalidateRowIndex_(tabName);
      return Utils.success({ deleted: true });
    });
  }
};
