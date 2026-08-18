/**
 * Cổng vào DUY NHẤT frontend được gọi (google.script.run). Frontend không được gọi thẳng
 * module nghiệp vụ hay SpreadsheetApp (bất biến kiến trúc, xem CLAUDE.md).
 *
 * QUY ƯỚC BẮT BUỘC: mọi hàm dưới đây là toàn bộ bề mặt public của hệ thống. Hàm nào không có
 * trong danh sách này thì KHÔNG được thiết kế để gọi từ trình duyệt. Danh tính người gọi luôn
 * xác định qua token phiên (tham số đầu tiên của mọi hàm cần đăng nhập) — token được cấp bởi
 * login() và server tự tra lại danh tính thật từ Sheet _SESSIONS/25_NGUOI_DUNG mỗi lần, KHÔNG
 * có hàm nào tin vào bất kỳ thông tin "vai trò"/"quyền" nào client tự gửi lên.
 *
 * Danh sách hàm public: doGet, include, login, logout, changePassword, getCurrentUserInfo, ping,
 * getDeviceFormOptions, listDevices, getDeviceDetail, createDevice, updateDevice,
 * getDashboardSummary, listCategoryItems, createCategoryItem, updateCategoryItem, listUsers,
 * listRoles, createUser, updateUser, resetUserPassword, getAuditLog.
 */

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('Quản lý Trang thiết bị Y tế')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Helper include chuẩn của HtmlService. CHỈ được gọi với tên file hardcode trong template
 * (Index.html...), không bao giờ với giá trị đến từ client/tham số URL.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Bọc mọi Controller qua đây: lỗi nghiệp vụ (AppError) trả nguyên văn cho client; lỗi hệ thống
 * khác chỉ log server-side, trả về mã lỗi chung — không rò rỉ stack trace/tên sheet ra trình duyệt.
 */
function _invokeController_(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof AppError) {
      return Utils.fail(err.code, err.message);
    }
    console.error('Internal error: ' + (err && err.stack ? err.stack : err));
    return Utils.fail(ERROR_CODES.INTERNAL_ERROR, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
  }
}

function login(loginId, password) {
  return _invokeController_(function () {
    return Utils.success(Auth.login(loginId, password));
  });
}

function logout(token) {
  return _invokeController_(function () {
    return Utils.success(Auth.logout(token));
  });
}

function changePassword(token, oldPassword, newPassword) {
  return _invokeController_(function () {
    return Utils.success(Auth.changePassword(token, oldPassword, newPassword));
  });
}

function getCurrentUserInfo(token) {
  return _invokeController_(function () {
    return Utils.success(Auth.getCurrentUser(token));
  });
}

/** Endpoint smoke-test: xác nhận pipeline doGet -> Core -> Database hoạt động end-to-end. Không cần đăng nhập. */
function ping() {
  return _invokeController_(function () {
    return Utils.success({ serverTime: Utils.nowIso(), schemaVersion: SCHEMA_VERSION });
  });
}

function getDeviceFormOptions(token) {
  return _invokeController_(function () {
    return Utils.success(Config.getDeviceFormOptions(token));
  });
}

function listDevices(token, filter, page) {
  return _invokeController_(function () {
    return Utils.success(Device.listDevices(token, filter, page));
  });
}

function getDeviceDetail(token, id) {
  return _invokeController_(function () {
    return Utils.success(Device.getDeviceDetail(token, id));
  });
}

function createDevice(token, data) {
  return _invokeController_(function () {
    return Utils.success(Device.createDevice(token, data));
  });
}

function updateDevice(token, id, data) {
  return _invokeController_(function () {
    return Utils.success(Device.updateDevice(token, id, data));
  });
}

function getDashboardSummary(token) {
  return _invokeController_(function () {
    return Utils.success(Device.getDashboardSummary(token));
  });
}

function listCategoryItems(token, tabName) {
  return _invokeController_(function () { return Utils.success(Admin.listCategoryItems(token, tabName)); });
}

function createCategoryItem(token, tabName, data) {
  return _invokeController_(function () { return Utils.success(Admin.createCategoryItem(token, tabName, data)); });
}

function updateCategoryItem(token, tabName, id, data) {
  return _invokeController_(function () { return Utils.success(Admin.updateCategoryItem(token, tabName, id, data)); });
}

function listUsers(token) {
  return _invokeController_(function () { return Utils.success(Admin.listUsers(token)); });
}

function listRoles(token) {
  return _invokeController_(function () { return Utils.success(Admin.listRoles(token)); });
}

function createUser(token, data, initialPassword) {
  return _invokeController_(function () { return Utils.success(Admin.createUser(token, data, initialPassword)); });
}

function updateUser(token, id, data) {
  return _invokeController_(function () { return Utils.success(Admin.updateUser(token, id, data)); });
}

function resetUserPassword(token, id, newPassword) {
  return _invokeController_(function () { return Utils.success(Admin.resetUserPassword(token, id, newPassword)); });
}

function getAuditLog(token, page) {
  return _invokeController_(function () { return Utils.success(Admin.getAuditLog(token, page)); });
}
