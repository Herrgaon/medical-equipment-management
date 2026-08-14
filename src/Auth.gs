/**
 * Điểm chốt xác thực/phân quyền DUY NHẤT của toàn hệ thống — đăng nhập bằng tên đăng nhập + mật
 * khẩu tự quản lý (KHÔNG dựa vào Google Account/Session.getActiveUser(), không cần email thật).
 * Lý do: Web App chạy dưới quyền người deploy (executeAs=USER_DEPLOYING) để không ai cần được
 * cấp quyền Editor trực tiếp trên Google Sheet — nhưng đổi lại Apps Script không đọc được danh
 * tính người truy cập một cách đáng tin cậy khi họ không cùng domain Workspace với người deploy.
 * Đăng nhập tên đăng nhập/mật khẩu giải quyết cả 2 vấn đề: không phụ thuộc domain, và không ai
 * có đường trực tiếp sửa Sheet ngoài app.
 *
 * Mọi Service layer và Core.gs đều đi qua đây — không tự kiểm tra quyền rải rác nơi khác.
 */

var Auth = {

  /** Sinh chuỗi ngẫu nhiên dùng làm muối (salt) hoặc token phiên — dùng Utilities.getUuid(), đủ
   * ngẫu nhiên để không đoán được, KHÔNG dùng bộ đếm tuần tự cho bất kỳ giá trị nào cần bảo mật. */
  _randomToken_: function () {
    return Utilities.getUuid() + Utilities.getUuid();
  },

  /**
   * Băm mật khẩu: SHA-256 lặp PASSWORD_HASH_ITERATIONS vòng cùng muối riêng từng user (kiểu
   * key-stretching thủ công, vì Apps Script không có bcrypt/scrypt/Argon2 sẵn). Không mạnh bằng
   * thuật toán chuyên dụng cho mật khẩu, nhưng là lựa chọn tốt nhất trong giới hạn nền tảng.
   */
  _hashPassword_: function (plainPassword, salt) {
    var digestInput = salt + '|' + plainPassword;
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, digestInput, Utilities.Charset.UTF_8);
    for (var i = 0; i < PASSWORD_HASH_ITERATIONS; i++) {
      bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
    }
    return Utilities.base64Encode(bytes);
  },

  /** So sánh không rò rỉ thời gian sớm/muộn theo độ dài chuỗi khớp (hạn chế timing attack cơ bản). */
  _constantTimeEquals_: function (a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  },

  setPassword_: function (userRow, plainPassword, actor) {
    var salt = this._randomToken_();
    var hash = this._hashPassword_(plainPassword, salt);
    return Database.updateRowById('25_NGUOI_DUNG', userRow.ID, {
      PASSWORD_HASH: hash,
      PASSWORD_SALT: salt,
      PASSWORD_SET_AT: Utils.nowIso(),
      FAILED_LOGIN_COUNT: 0,
      LOCKED_UNTIL: ''
    }, actor);
  },

  /**
   * Đăng nhập: kiểm tra khoá tạm, so khớp mật khẩu, đếm/khoá khi sai, cấp token phiên khi đúng.
   * KHÔNG bao giờ tiết lộ qua thông báo lỗi việc "tên đăng nhập không tồn tại" khác với "sai mật
   * khẩu" (cùng 1 thông báo chung) — tránh lộ tên đăng nhập nào đã được cấp cho người dò quét.
   */
  login: function (loginId, password) {
    Utils.assert(!Utils.isBlank(loginId) && !Utils.isBlank(password), ERROR_CODES.VALIDATION_ERROR, 'Thiếu tên đăng nhập hoặc mật khẩu.');
    var GENERIC_FAIL = 'Tên đăng nhập hoặc mật khẩu không đúng.';

    var user = Database.findOne('25_NGUOI_DUNG', { TEN_DANG_NHAP: String(loginId).trim() });
    if (!user) throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, GENERIC_FAIL);

    if (user.LOCKED_UNTIL && new Date(user.LOCKED_UNTIL).getTime() > Date.now()) {
      throw new AppError(ERROR_CODES.ACCOUNT_LOCKED,
        'Tài khoản đang tạm khoá do nhập sai nhiều lần. Thử lại sau ' + LOGIN_LOCKOUT_MINUTES + ' phút.');
    }
    if (user.TRANG_THAI === 'Khoá') {
      throw new AppError(ERROR_CODES.ACCOUNT_LOCKED, 'Tài khoản đã bị khoá.');
    }
    if (!user.PASSWORD_HASH) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Tài khoản chưa được thiết lập mật khẩu.');
    }

    var computedHash = this._hashPassword_(password, user.PASSWORD_SALT);
    if (!this._constantTimeEquals_(computedHash, user.PASSWORD_HASH)) {
      var failCount = (parseInt(user.FAILED_LOGIN_COUNT, 10) || 0) + 1;
      var patch = { FAILED_LOGIN_COUNT: failCount };
      if (failCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
        patch.LOCKED_UNTIL = new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60000).toISOString();
        patch.FAILED_LOGIN_COUNT = 0;
      }
      Database.updateRowById('25_NGUOI_DUNG', user.ID, patch, user.TEN_DANG_NHAP);
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, GENERIC_FAIL);
    }

    if (parseInt(user.FAILED_LOGIN_COUNT, 10) > 0) {
      Database.updateRowById('25_NGUOI_DUNG', user.ID, { FAILED_LOGIN_COUNT: 0, LOCKED_UNTIL: '' }, user.TEN_DANG_NHAP);
    }

    var token = this._createSession_(user);
    Database.appendAuditLog(user.TEN_DANG_NHAP, 'LOGIN', 'SESSION', user.ID, null, null);
    return { token: token, user: this._toPublicUser_(user) };
  },

  logout: function (token) {
    if (!Utils.isBlank(token)) {
      Database.deleteSessionRow_(token);
    }
    return { loggedOut: true };
  },

  _createSession_: function (userRow) {
    var token = this._randomToken_();
    var now = new Date();
    var expires = new Date(now.getTime() + SESSION_TTL_HOURS * 3600000);
    Database.insertRow('_SESSIONS', {
      ID: token,
      USER_ID: userRow.ID,
      TEN_DANG_NHAP: userRow.TEN_DANG_NHAP,
      CREATED_AT: now.toISOString(),
      EXPIRES_AT: expires.toISOString(),
      LAST_SEEN_AT: now.toISOString()
    }, userRow.TEN_DANG_NHAP);
    return token;
  },

  _toPublicUser_: function (userRow) {
    return {
      id: userRow.ID,
      tenDangNhap: userRow.TEN_DANG_NHAP,
      hoTen: userRow.HO_TEN,
      nickname: userRow.NICKNAME,
      chucDanh: userRow.CHUC_DANH,
      vaiTroId: userRow.VAI_TRO_ID,
      khoaPhongPhuTrach: userRow.KHOA_PHONG_PHU_TRACH || '',
      avatarFileId: userRow.AVATAR_FILE_ID || ''
    };
  },

  /**
   * Xác thực token phiên, trả về user đầy đủ (kèm vai trò). Có cache 60s theo token trong
   * CacheService (không phải UserCache — token đại diện danh tính, không phải trình duyệt/Google
   * account) để giảm số lần đọc Sheet khi 1 phiên gọi nhiều request liên tiếp.
   */
  _resolveSession_: function (token) {
    Utils.assert(!Utils.isBlank(token), ERROR_CODES.UNAUTHENTICATED, 'Chưa đăng nhập.');

    var cache = CacheService.getScriptCache();
    var cacheKey = 'session_' + token;
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    var session = Database.getById('_SESSIONS', token);
    if (!session) throw new AppError(ERROR_CODES.SESSION_EXPIRED, 'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại.');
    if (new Date(session.EXPIRES_AT).getTime() < Date.now()) {
      Database.deleteSessionRow_(token);
      throw new AppError(ERROR_CODES.SESSION_EXPIRED, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    }

    var userRow = Database.getById('25_NGUOI_DUNG', session.USER_ID);
    if (!userRow || userRow.TRANG_THAI === 'Khoá') {
      Database.deleteSessionRow_(token);
      throw new AppError(ERROR_CODES.ACCOUNT_LOCKED, 'Tài khoản không còn hoạt động.');
    }

    // findOne() luôn đọc trực tiếp toàn sheet (không qua cache chỉ-số dòng) — dùng ở đây thay vì
    // getById() để tránh phụ thuộc cache cho một lượt tra cứu hiếm khi gọi (mỗi phiên vài lần).
    var roleRow = Database.findOne('26_QUYEN', { ID: userRow.VAI_TRO_ID });
    var result = {
      id: userRow.ID,
      tenDangNhap: userRow.TEN_DANG_NHAP,
      hoTen: userRow.HO_TEN,
      nickname: userRow.NICKNAME,
      chucDanh: userRow.CHUC_DANH,
      vaiTroId: userRow.VAI_TRO_ID,
      vaiTro: roleRow ? roleRow.VAI_TRO : '',
      khoaPhongPhuTrach: userRow.KHOA_PHONG_PHU_TRACH || '',
      avatarFileId: userRow.AVATAR_FILE_ID || ''
    };
    try {
      cache.put(cacheKey, JSON.stringify(result), 60);
    } catch (e) {
      // Bỏ qua nếu cache lỗi.
    }
    return result;
  },

  getCurrentUser: function (token) {
    return this._resolveSession_(token);
  },

  /**
   * Kiểu allow-list: chỉ cho phép khi tìm thấy đúng dòng quyền vai trò+module và cột hành động = true.
   * KHÔNG kiểu "danh sách chặn" — kiểu chặn dễ fail-open (vai trò/module mới thêm sau sẽ mặc định
   * được phép nếu quên thêm vào danh sách chặn).
   */
  checkPermission: function (token, module, action) {
    var user = this._resolveSession_(token);
    var actionColumn = PERMISSION_ACTIONS[action];
    Utils.assert(actionColumn, ERROR_CODES.VALIDATION_ERROR, 'Hành động quyền không hợp lệ: ' + action);

    var rules = Database.list('26_QUYEN', { filters: { VAI_TRO: user.vaiTro, MODULE: module } }).items;
    var allowed = rules.length > 0 && rules[0][actionColumn] === true;
    var isWholeHospitalScope = Utils.isBlank(user.khoaPhongPhuTrach);
    return {
      allowed: allowed,
      user: user,
      scope: { type: isWholeHospitalScope ? 'ALL' : 'LIST', departmentIds: isWholeHospitalScope ? [] : String(user.khoaPhongPhuTrach).split(',') }
    };
  },

  /**
   * Hàm dùng bởi Core.gs (chặn thô trước khi dispatch) và Service layer (chặn chi tiết theo
   * đúng khoa/phòng của bản ghi, Sprint 1.2+). Đây là 2 điểm chặn ĐỘC LẬP dùng lại cùng 1 logic —
   * không phải trùng lặp: một điểm quên gọi không làm thủng toàn bộ.
   */
  assertPermission: function (token, module, action) {
    var result = this.checkPermission(token, module, action);
    if (!result.allowed) {
      throw new AppError(ERROR_CODES.PERMISSION_DENIED,
        'Tài khoản không có quyền "' + action + '" trên module "' + module + '".');
    }
    return result;
  },

  /**
   * Tự đổi mật khẩu: bắt buộc nhập đúng mật khẩu cũ (không cho đổi chỉ bằng token — phòng trường
   * hợp lộ token phiên trên thiết bị dùng chung vẫn không đổi được mật khẩu người khác).
   * Dùng cho luồng: Admin tạo tài khoản với mật khẩu mặc định -> nhân viên tự đăng nhập rồi đổi
   * lại mật khẩu riêng (Sprint 1.4 sẽ có UI, cơ chế đã sẵn từ đây).
   */
  changePassword: function (token, oldPassword, newPassword) {
    var session = this._resolveSession_(token);
    Utils.assert(!Utils.isBlank(newPassword) && newPassword.length >= 8, ERROR_CODES.VALIDATION_ERROR,
      'Mật khẩu mới phải có ít nhất 8 ký tự.');

    var userRow = Database.getById('25_NGUOI_DUNG', session.id);
    Utils.assert(userRow, ERROR_CODES.NOT_FOUND, 'Không tìm thấy tài khoản.');

    var computedHash = this._hashPassword_(oldPassword, userRow.PASSWORD_SALT);
    if (!this._constantTimeEquals_(computedHash, userRow.PASSWORD_HASH)) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Mật khẩu hiện tại không đúng.');
    }

    this.setPassword_(userRow, newPassword, userRow.TEN_DANG_NHAP);
    Database.appendAuditLog(userRow.TEN_DANG_NHAP, 'CHANGE_PASSWORD', 'USER', userRow.ID, null, null);
    return { changed: true };
  }
};
