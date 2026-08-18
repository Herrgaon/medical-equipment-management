/**
 * Đăng ký schema 36 Sheet + hằng số dùng chung toàn hệ thống.
 * Nguồn: docs/Phuong_an_thiet_ke_He_thong_QL_TBYT_BVDK_Dong_Son.md mục 3.3, 4, 5, 6.1.
 * Đây là nơi DUY NHẤT khai báo tên sheet/tên cột — không lặp lại string literal ở file khác.
 */

var SCHEMA_VERSION = 1;
var ID_SEQUENCE_WIDTH = 6;

// 6 cột hệ thống chung cho mọi bảng nghiệp vụ (10-24, 29-36), thêm vào cuối danh sách cột riêng.
var COMMON_BUSINESS_COLUMNS = ['NGAY_TAO', 'NGUOI_TAO', 'NGAY_CAP_NHAT', 'NGUOI_CAP_NHAT', 'GHI_CHU'];

// Khuôn mẫu chung cho các Sheet danh mục (02-09, 27).
var CATEGORY_TEMPLATE_COLUMNS = ['MA', 'TEN', 'MO_TA', 'CAP_TREN_ID', 'TRANG_THAI'];
var AUDIT_TRAIL_COLUMNS = ['CREATED_AT', 'CREATED_BY', 'UPDATED_AT', 'UPDATED_BY'];

// Trường điều kiện luôn đúng 3 trạng thái này — không được để trống, không tự suy diễn (CLAUDE.md).
var THREE_STATE_VALUES = ['Có', 'Không áp dụng', 'Chưa xác định'];

// 12 trạng thái TRANG_THAI_QUAN_LY của thiết bị (mục 6.1). Chuyển trạng thái chỉ qua Device.gs (Sprint 1.2).
var DEVICE_STATUS = {
  DANG_TIEP_NHAN: 'Đang tiếp nhận',
  CHO_NGHIEM_THU: 'Chờ nghiệm thu',
  DA_NGHIEM_THU: 'Đã nghiệm thu',
  CHO_BAN_GIAO: 'Chờ bàn giao',
  DANG_SU_DUNG: 'Đang sử dụng',
  DANG_BAO_TRI: 'Đang bảo trì',
  DANG_SUA_CHUA: 'Đang sửa chữa',
  CHO_KIEM_TRA_SAU_SUA_CHUA: 'Chờ kiểm tra sau sửa chữa',
  TAM_NGUNG_SU_DUNG: 'Tạm ngừng sử dụng',
  CHO_DIEU_CHUYEN: 'Chờ điều chuyển',
  CHO_THANH_LY: 'Chờ thanh lý',
  DA_THANH_LY: 'Đã thanh lý'
};

// 6 vai trò hệ thống (mục 5) — chính tả chuẩn, tránh so sánh chuỗi tiếng Việt gõ sai lặt vặt.
var ROLES = {
  SUPER_ADMIN: 'Super Admin',
  DEVICE_MANAGER: 'Quản lý thiết bị',
  TECHNICIAN: 'Kỹ thuật viên',
  DEPARTMENT: 'Khoa/phòng',
  LEADERSHIP: 'Lãnh đạo',
  VIEWER: 'Người xem'
};

// Map hành động quyền -> tên cột boolean trong 26_QUYEN.
var PERMISSION_ACTIONS = {
  VIEW: 'QUYEN_XEM',
  CREATE: 'QUYEN_TAO',
  EDIT: 'QUYEN_SUA',
  APPROVE: 'QUYEN_DUYET',
  DELETE: 'QUYEN_XOA',
  LOCK: 'QUYEN_KHOA'
};

var ERROR_CODES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  NOT_REGISTERED: 'NOT_REGISTERED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE: 'DUPLICATE',
  PROTECTED_FIELD: 'PROTECTED_FIELD',
  LOCK_TIMEOUT: 'LOCK_TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED'
};

// Tham số băm mật khẩu — SHA-256 lặp nhiều vòng (Apps Script không có bcrypt/Argon2 sẵn).
// Không mạnh bằng thuật toán chuyên dụng cho mật khẩu, nhưng là lựa chọn tốt nhất trong giới hạn
// nền tảng; phù hợp quy mô nội bộ bệnh viện, không phải hệ thống đối mặt Internet công khai quy mô lớn.
var PASSWORD_HASH_ITERATIONS = 10000;
var SESSION_TTL_HOURS = 12;
var MAX_FAILED_LOGIN_ATTEMPTS = 5;
var LOGIN_LOCKOUT_MINUTES = 15;

// Field bị khoá khỏi Database.updateRowById — chỉ sửa được qua hàm nghiệp vụ chuyên biệt.
var PROTECTED_FIELDS = {
  '01_THIET_BI': ['TRANG_THAI_QUAN_LY']
};

/**
 * SCHEMA_REGISTRY: 1 phần tử / 1 Sheet, theo đúng thứ tự 01-36 trong tài liệu thiết kế.
 * template: 'CORE' (01, tự khai đủ cột) | 'CATEGORY' (danh mục dùng chung khuôn mẫu)
 *         | 'PEOPLE' | 'PERMISSION' (25, 26 — schema riêng, không theo khuôn mẫu danh mục)
 *         | 'BUSINESS' (nghiệp vụ, có THIET_BI_ID + 6 cột chung) | 'AUDIT' (28, bất biến)
 */
var SCHEMA_REGISTRY = [
  {
    index: 1, tabName: '01_THIET_BI', idPrefix: 'DEV-', template: 'CORE',
    // Transcribe nguyên văn mục 4.1. Ghi chú: NUOC_SAN_XUAT giữ là Text tự do đúng như đặc tả gốc
    // (dù mục 4.2 có dành tiền tố NSX- cho 07_NUOC_SAN_XUAT — tài liệu không nói rõ đây có phải FK
    // hay không, nên KHÔNG tự ý nối FK khi đặc tả không xác nhận rõ).
    // 5 cột cuối (MA_KHAI_BH..DON_VI_TINH) thêm sau, sau khi đối chiếu docs/Danh mục TBYT.xlsx
    // (danh mục thiết bị thật của bệnh viện) — xem CLAUDE.md mục "Dữ liệu tồn kho thật". Text tự
    // do, không tạo sheet danh mục riêng (không đủ căn cứ cho danh sách cố định, giống NUOC_SAN_XUAT).
    columns: [
      'MA_THIET_BI', 'TEN_THIET_BI', 'LOAI_THIET_BI_ID', 'NHA_CUNG_CAP_ID', 'PHAN_LOAI',
      'NHOM_THIET_BI_ID', 'HANG_SAN_XUAT_ID', 'NUOC_SAN_XUAT', 'NAM_SAN_XUAT', 'MODEL', 'SERIAL',
      'KHOA_PHONG_ID', 'VI_TRI_ID', 'NGUOI_PHU_TRACH_ID', 'TINH_TRANG_KY_THUAT', 'TRANG_THAI_QUAN_LY',
      'NGAY_DUA_VAO_SU_DUNG', 'HINH_THUC_MUA_SAM', 'NGAY_BAT_DAU_BAO_HANH', 'NGAY_HET_BAO_HANH',
      'QR_URL', 'FOLDER_ID',
      'MA_KHAI_BH', 'SO_GIAY_PHEP_NK_LH', 'NGUON_KINH_PHI', 'NGUYEN_GIA', 'DON_VI_TINH',
      // GHI_CHU thêm khi làm Import Excel cho dữ liệu tồn kho thật — 01_THIET_BI dùng template CORE
      // (không tự có GHI_CHU như BUSINESS) nên phải khai tường minh; dùng để giữ mã thiết bị cũ của
      // bệnh viện (không khớp định dạng MA_THIET_BI hệ thống tự sinh) + ghi chú tự do từ Excel gốc.
      'GHI_CHU'
    ].concat(AUDIT_TRAIL_COLUMNS)
  },
  { index: 2, tabName: '02_LOAI_THIET_BI', idPrefix: 'LOAI-', template: 'CATEGORY', columns: [] },
  { index: 3, tabName: '03_NHOM_THIET_BI', idPrefix: 'NHOM-', template: 'CATEGORY', columns: [] },
  { index: 4, tabName: '04_KHOA_PHONG', idPrefix: 'KP-', template: 'CATEGORY', columns: [] },
  { index: 5, tabName: '05_VI_TRI', idPrefix: 'VT-', template: 'CATEGORY', columns: [] },
  { index: 6, tabName: '06_HANG_SAN_XUAT', idPrefix: 'HSX-', template: 'CATEGORY', columns: [] },
  { index: 7, tabName: '07_NUOC_SAN_XUAT', idPrefix: 'NSX-', template: 'CATEGORY', columns: [] },
  { index: 8, tabName: '08_NHA_CUNG_CAP', idPrefix: 'NCC-', template: 'CATEGORY', columns: [] },
  { index: 9, tabName: '09_NGUOI_PHU_TRACH', idPrefix: 'NPT-', template: 'CATEGORY', columns: [] },
  {
    index: 10, tabName: '10_TIEP_NHAN', idPrefix: 'RCV-', template: 'BUSINESS',
    columns: ['NGAY_TIEP_NHAN', 'NGUON_HINH_THANH', 'DON_VI_BAN_GIAO', 'HO_SO_KEM_THEO', 'TINH_TRANG_KHI_NHAN', 'TRANG_THAI']
  },
  {
    index: 11, tabName: '11_NGHIEM_THU', idPrefix: 'ACP-', template: 'BUSINESS',
    columns: ['NGAY_NGHIEM_THU', 'HOI_DONG_NGHIEM_THU', 'KET_QUA', 'TON_TAI_GHI_NHAN', 'BIEN_BAN_FILE_ID']
  },
  {
    index: 12, tabName: '12_BAN_GIAO', idPrefix: 'HDO-', template: 'BUSINESS',
    columns: ['NGAY_BAN_GIAO', 'DON_VI_NHAN', 'NGUOI_NHAN_ID', 'KHOA_PHONG_NHAN_ID', 'VI_TRI_NHAN_ID', 'PHIEU_FILE_ID', 'XAC_NHAN']
  },
  {
    index: 13, tabName: '13_BAO_HANH', idPrefix: 'WAR-', template: 'BUSINESS',
    columns: ['NGAY_BAT_DAU', 'NGAY_KET_THUC', 'DON_VI_BAO_HANH', 'DIEU_KIEN_PHAM_VI', 'LAN_YEU_CAU_THU_MAY', 'KET_QUA_XU_LY', 'FILE_HO_SO']
  },
  {
    index: 14, tabName: '14_BAO_TRI', idPrefix: 'MNT-', template: 'BUSINESS',
    columns: ['KY_BAO_TRI', 'NGAY_KE_HOACH', 'NGAY_THUC_HIEN', 'CHECKLIST_ID', 'NGUOI_THUC_HIEN', 'KET_QUA', 'KY_TIEP_THEO']
  },
  {
    index: 15, tabName: '15_KIEM_DINH', idPrefix: 'INS-', template: 'BUSINESS',
    columns: ['CAN_CU_AP_DUNG', 'NGAY_THUC_HIEN', 'DON_VI_KIEM_DINH', 'TRANG_THAI', 'NGAY_HET_HAN', 'CHUNG_NHAN_FILE_ID']
  },
  {
    index: 16, tabName: '16_HIEU_CHUAN', idPrefix: 'CAL-', template: 'BUSINESS',
    columns: ['CAN_CU_AP_DUNG', 'NGAY_THUC_HIEN', 'DON_VI_HIEU_CHUAN', 'TRANG_THAI', 'NGAY_HET_HAN', 'CHUNG_NHAN_FILE_ID']
  },
  {
    index: 17, tabName: '17_AN_TOAN_BUC_XA', idPrefix: 'RAD-', template: 'BUSINESS',
    columns: ['AP_DUNG', 'SO_GIAY_PHEP', 'CO_QUAN_CAP', 'NGAY_CAP', 'THOI_HAN', 'FILE_GIAY_PHEP']
  },
  {
    index: 18, tabName: '18_HO_SO_PHONG_XQ_CT', idPrefix: 'XRM-', template: 'BUSINESS',
    columns: ['LOAI_PHONG', 'TEN_PHONG', 'VI_TRI_ID', 'SO_GIAY_CHUNG_NHAN', 'NGAY_CAP', 'HIEU_LUC_DEN', 'DON_VI_CAP', 'KET_QUA', 'FILE']
  },
  {
    index: 19, tabName: '19_SU_CO', idPrefix: 'INC-', template: 'BUSINESS',
    columns: ['NGAY_BAO_SU_CO', 'NGUON_BAO', 'MO_TA', 'MUC_DO', 'NGUOI_BAO', 'TRANG_THAI']
  },
  {
    index: 20, tabName: '20_SUA_CHUA', idPrefix: 'REP-', template: 'BUSINESS',
    columns: ['SU_CO_ID', 'NGUYEN_NHAN', 'NOI_DUNG', 'BIEN_PHAP', 'DON_VI_THUC_HIEN', 'NGAY_BAT_DAU', 'NGAY_HOAN_THANH', 'CHI_PHI', 'KET_QUA_KIEM_TRA_SAU_SUA', 'XAC_NHAN_SU_DUNG']
  },
  {
    index: 21, tabName: '21_DIEU_CHUYEN', idPrefix: 'TRF-', template: 'BUSINESS',
    columns: ['KHOA_PHONG_CU_ID', 'KHOA_PHONG_MOI_ID', 'VI_TRI_CU_ID', 'VI_TRI_MOI_ID', 'LY_DO', 'NGUOI_DUYET', 'TRANG_THAI']
  },
  {
    index: 22, tabName: '22_TAI_LIEU', idPrefix: 'DOC-', template: 'BUSINESS',
    columns: ['NHOM_TAI_LIEU', 'TEN_FILE', 'FILE_ID', 'FOLDER_ID', 'PHIEN_BAN', 'NGUOI_UPLOAD']
  },
  {
    index: 23, tabName: '23_CANH_BAO', idPrefix: 'ALR-', template: 'BUSINESS',
    columns: ['LOAI_CANH_BAO', 'MUC_DO', 'NGAY_PHAT_SINH', 'TRANG_THAI']
  },
  {
    index: 24, tabName: '24_KIEM_KE', idPrefix: 'INV-', template: 'BUSINESS',
    columns: ['DOT_KIEM_KE_ID', 'NGAY_QUET', 'NGUOI_QUET_ID', 'VI_TRI_QUET', 'KET_QUA']
  },
  {
    // Tiền tố ND-/QUY-/CH- không có trong tài liệu thiết kế gốc (mục 3.3 không liệt kê 25-27) —
    // tự chọn theo phong cách viết tắt tiếng Việt giống 02-09, cần Khoa Dược - VTTBYT xác nhận lại
    // khi duyệt thiết kế kỹ thuật chi tiết nếu muốn đổi.
    index: 25, tabName: '25_NGUOI_DUNG', idPrefix: 'ND-', template: 'PEOPLE',
    // Không có cột EMAIL — đăng nhập bằng TEN_DANG_NHAP + mật khẩu tự quản lý, không qua Google
    // Account, nên không cần địa chỉ email thật. NGUOI_TAO/audit ghi theo TEN_DANG_NHAP.
    columns: [
      'TEN_DANG_NHAP', 'HO_TEN', 'NICKNAME', 'CHUC_DANH', 'VAI_TRO_ID', 'KHOA_PHONG_PHU_TRACH',
      'AVATAR_FILE_ID', 'TRANG_THAI',
      'PASSWORD_HASH', 'PASSWORD_SALT', 'PASSWORD_SET_AT', 'FAILED_LOGIN_COUNT', 'LOCKED_UNTIL'
    ].concat(AUDIT_TRAIL_COLUMNS)
  },
  {
    index: 26, tabName: '26_QUYEN', idPrefix: 'QUY-', template: 'PERMISSION',
    columns: ['VAI_TRO', 'MODULE', 'QUYEN_XEM', 'QUYEN_TAO', 'QUYEN_SUA', 'QUYEN_DUYET', 'QUYEN_XOA', 'QUYEN_KHOA'].concat(AUDIT_TRAIL_COLUMNS)
  },
  {
    index: 27, tabName: '27_CAU_HINH', idPrefix: 'CH-', template: 'CATEGORY',
    columns: ['LOAI_THIET_BI_ID', 'LOAI_QUY_TAC', 'CHU_KY_THANG', 'SO_NGAY_CANH_BAO_TRUOC', 'CAN_CU_AP_DUNG', 'BAT_BUOC']
  },
  {
    index: 28, tabName: '28_AUDIT_LOG', idPrefix: 'LOG-', template: 'AUDIT',
    columns: ['THOI_GIAN', 'NGUOI_THUC_HIEN', 'HANH_DONG', 'DOI_TUONG_LOAI', 'DOI_TUONG_ID', 'GIA_TRI_TRUOC', 'GIA_TRI_SAU']
  },
  {
    index: 29, tabName: '29_CHECKLIST_HO_SO', idPrefix: 'CHK-', template: 'BUSINESS',
    columns: ['LOAI_TAI_LIEU', 'TRANG_THAI', 'SO_NGAY_VAN_BAN', 'FILE_ID']
  },
  {
    index: 30, tabName: '30_DAO_TAO_NGUOI_DUNG', idPrefix: 'TRN-', template: 'BUSINESS',
    columns: ['NGUOI_DUOC_DAO_TAO_ID', 'KHOA_PHONG_ID', 'CHUC_DANH', 'NGAY', 'HINH_THUC', 'NOI_DUNG', 'DON_VI_DAO_TAO', 'KET_QUA', 'FILE_CHUNG_NHAN']
  },
  {
    index: 31, tabName: '31_CANH_BAO_AN_TOAN', idPrefix: 'SAF-', template: 'BUSINESS',
    columns: ['NGUON_THONG_BAO', 'SO_NGAY', 'HANG_CO_QUAN', 'NOI_DUNG', 'MUC_DO', 'PHAM_VI', 'HANH_DONG', 'NGUOI_PHU_TRACH', 'HAN_XU_LY', 'MINH_CHUNG_FILE', 'NGAY_DONG']
  },
  {
    index: 32, tabName: '32_PHU_TUNG', idPrefix: 'PRT-', template: 'BUSINESS',
    columns: ['SUA_CHUA_ID', 'TEN_PHU_TUNG', 'PART_NUMBER', 'SERIAL', 'HANG', 'NGAY_THAY', 'SO_LUONG', 'DON_GIA', 'THANH_TIEN', 'NHA_CUNG_CAP', 'CHUNG_TU_FILE', 'BAO_HANH_PHU_TUNG']
  },
  {
    index: 33, tabName: '33_DOWNTIME', idPrefix: 'DWT-', template: 'BUSINESS',
    columns: ['SU_CO_ID', 'THOI_DIEM_NGUNG', 'THOI_DIEM_BAO_SU_CO', 'THOI_DIEM_TIEP_NHAN', 'THOI_DIEM_BAT_DAU_SUA', 'THOI_DIEM_HOAN_THANH', 'THOI_DIEM_DUOC_SU_DUNG_LAI', 'TONG_THOI_GIAN_PHUT']
  },
  {
    index: 34, tabName: '34_THANH_LY', idPrefix: 'LIQ-', template: 'BUSINESS',
    columns: ['NGAY_DE_NGHI', 'LY_DO', 'PHUONG_AN_DE_XUAT', 'HOI_DONG_DUYET', 'NGAY_PHE_DUYET', 'NGAY_THUC_HIEN', 'HO_SO_FILE', 'TRANG_THAI']
  },
  {
    index: 35, tabName: '35_KHAC_PHUC_AUDIT', idPrefix: 'AUD-', template: 'BUSINESS',
    columns: ['NGUON_AUDIT', 'TON_TAI', 'NGUOI_CHIU_TRACH_NHIEM', 'HAN_HOAN_THANH', 'TRANG_THAI', 'MINH_CHUNG_FILE', 'NGAY_XAC_NHAN_DONG']
  },
  {
    index: 36, tabName: '36_CONG_VIEC', idPrefix: 'TSK-', template: 'BUSINESS',
    columns: ['CANH_BAO_ID', 'LOAI_CONG_VIEC', 'NGUOI_PHU_TRACH_ID', 'HAN_XU_LY', 'TRANG_THAI', 'MINH_CHUNG_FILE']
  },
  {
    // Sheet hạ tầng kỹ thuật cho phiên đăng nhập — KHÔNG thuộc 36 sheet nghiệp vụ trong tài liệu
    // thiết kế gốc, đặt tên có gạch dưới đầu để phân biệt rõ. ID = chính token phiên (UUID ngẫu
    // nhiên, KHÔNG dùng bộ đếm tuần tự — token phải không đoán được).
    index: 99, tabName: '_SESSIONS', idPrefix: '', template: 'SESSION',
    columns: ['USER_ID', 'TEN_DANG_NHAP', 'CREATED_AT', 'EXPIRES_AT', 'LAST_SEEN_AT']
  }
];

/**
 * Trả về danh sách cột đầy đủ (đã ghép khuôn mẫu) cho 1 sheet — dùng bởi SetupSheets.gs và Database.gs.
 */
function getFullColumns_(entry) {
  var cols = ['ID'];
  if (entry.template === 'CATEGORY') {
    cols = cols.concat(CATEGORY_TEMPLATE_COLUMNS).concat(entry.columns).concat(AUDIT_TRAIL_COLUMNS);
  } else if (entry.template === 'BUSINESS') {
    cols = cols.concat(['THIET_BI_ID']).concat(entry.columns).concat(COMMON_BUSINESS_COLUMNS);
  } else {
    // CORE (01), PEOPLE (25), PERMISSION (26), AUDIT (28), SESSION (_SESSIONS) đã tự khai đủ
    // trong entry.columns.
    cols = cols.concat(entry.columns);
  }
  return cols;
}

function getSchemaEntry_(tabName) {
  for (var i = 0; i < SCHEMA_REGISTRY.length; i++) {
    if (SCHEMA_REGISTRY[i].tabName === tabName) return SCHEMA_REGISTRY[i];
  }
  throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy schema cho sheet: ' + tabName);
}
