# Cơ chế đăng nhập email/mật khẩu tự quản lý cho Google Apps Script

*Tài liệu kỹ thuật — mô tả cơ chế đã triển khai trong `medical-equipment-management`, viết để tái sử dụng cho các dự án Apps Script khác. Không phải đặc tả nghiệp vụ, chỉ mô tả cơ chế đăng nhập/phiên làm việc.*

## 1. Vấn đề cần giải quyết

Google Apps Script Web App thường xác thực người dùng theo 2 cách chuẩn của nền tảng:

| Cách | `executeAs` | Ưu điểm | Nhược điểm |
|---|---|---|---|
| Chạy dưới quyền người deploy | `USER_DEPLOYING` | Không ai cần được cấp quyền Editor trực tiếp trên Sheet/Drive gốc | `Session.getActiveUser()` chỉ đọc được email người truy cập một cách đáng tin cậy khi họ **cùng domain Google Workspace** với người deploy. Với tài khoản Gmail cá nhân làm chủ script, người ngoài domain hầu như luôn nhận được identity rỗng |
| Chạy dưới quyền người truy cập | `USER_ACCESSING` | Đọc đúng danh tính bất kỳ ai, không phụ thuộc domain | Muốn script (chạy dưới quyền họ) đọc/ghi được Sheet, **mỗi người dùng phải được cấp quyền Editor thật trên Sheet gốc** (`ss.addEditor(email)`). Hệ quả: ai cũng có thể tự mở Sheet, sửa tay trực tiếp — kể cả tự sửa vai trò của chính mình — bỏ qua toàn bộ lớp kiểm tra quyền của app. Google Sheets Protected Range **không giải quyết được** vì không phân biệt "app ghi hộ" với "người dùng tự gõ tay" khi cả hai chạy dưới cùng 1 danh tính |

Với hệ thống cần đảm bảo "không có cổng sau" — không ai được có đường tắt sửa dữ liệu ngoài đúng logic app — cả 2 cách chuẩn trên đều không đạt được đồng thời (đọc đúng danh tính) và (không ai có quyền Editor trực tiếp).

## 2. Giải pháp: đăng nhập tự quản lý, tách khỏi danh tính Google

Xây hẳn một lớp đăng nhập (tên đăng nhập + mật khẩu) độc lập với Google Account:

- `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS` — Web App ai cũng mở được link (kể cả không đăng nhập Google), nhưng script luôn chạy dưới quyền người deploy. Không ai khác cần quyền Editor trên Sheet.
- Không dùng `Session.getActiveUser()`/`getEffectiveUser()` cho mục đích xác thực người dùng thật — 2 hàm này **không đáng tin cậy khi không cùng domain** và **luôn trả về người deploy** (tương ứng), dùng nhầm cái nào cũng có thể tạo lỗ hổng.
- Danh tính người dùng = 1 dòng trong sheet `25_NGUOI_DUNG`, xác thực bằng mật khẩu tự lưu (băm), không liên quan gì đến việc họ có tài khoản Google hay không.
- Sau khi đăng nhập đúng, server cấp 1 **token phiên** ngẫu nhiên — client giữ token này (localStorage), gửi kèm theo mọi lời gọi server sau đó. Server tự tra lại danh tính từ token, không tin bất kỳ thông tin "vai trò"/"quyền" nào client tự gửi lên.

## 3. Schema

### `25_NGUOI_DUNG` (bảng người dùng)

| Cột | Vai trò |
|---|---|
| `ID` | PK, tiền tố `ND-` |
| `TEN_DANG_NHAP` | Định danh đăng nhập duy nhất (không cần đúng định dạng email) |
| `HO_TEN` | Họ tên đầy đủ |
| `NICKNAME` | Tên hiển thị ngắn (tuỳ chọn) |
| `CHUC_DANH` | Chức danh nghề nghiệp |
| `VAI_TRO_ID` | FK → bảng vai trò/quyền |
| `KHOA_PHONG_PHU_TRACH` | Khoa/phòng — dùng chung cho cả hiển thị "thuộc khoa nào" lẫn giới hạn phạm vi xem/sửa dữ liệu; rỗng = toàn viện (Super Admin/Lãnh đạo) |
| `AVATAR_FILE_ID` | ID file Drive ảnh đại diện (tuỳ chọn) |
| `TRANG_THAI` | `Đang hoạt động` / `Khoá` |
| `PASSWORD_HASH`, `PASSWORD_SALT`, `PASSWORD_SET_AT` | Mật khẩu đã băm + muối riêng từng người |
| `FAILED_LOGIN_COUNT`, `LOCKED_UNTIL` | Đếm/khoá tạm khi nhập sai nhiều lần |
| `CREATED_AT/BY`, `UPDATED_AT/BY` | Audit cơ bản |

Không có cột email/tài khoản Google — hệ thống hoàn toàn không phụ thuộc việc người dùng có Gmail hay không.

### `_SESSIONS` (bảng phiên đăng nhập, hạ tầng kỹ thuật — không phải bảng nghiệp vụ)

| Cột | Vai trò |
|---|---|
| `ID` | Chính là token phiên — **UUID ngẫu nhiên (`Utilities.getUuid()`), KHÔNG dùng bộ đếm tuần tự** (token phải không đoán được, khác hẳn ID nghiệp vụ thông thường) |
| `USER_ID` | FK → `25_NGUOI_DUNG.ID` |
| `TEN_DANG_NHAP` | Lưu kèm để tiện xem log, không dùng để xác thực |
| `CREATED_AT`, `EXPIRES_AT`, `LAST_SEEN_AT` | Quản lý thời hạn phiên |

## 4. Băm mật khẩu

Apps Script không có bcrypt/scrypt/Argon2 sẵn. Giải pháp thay thế: SHA-256 lặp nhiều vòng (mặc định 10.000 vòng, xem `PASSWORD_HASH_ITERATIONS` trong `Constants.gs`) cùng muối (salt) ngẫu nhiên riêng từng người dùng — kiểu key-stretching thủ công.

```
hash = SHA256( SHA256( ... SHA256(salt + "|" + password) ... ) )   // lặp N vòng
```

**Giới hạn cần biết rõ**: không mạnh bằng thuật toán chuyên dụng cho mật khẩu (bcrypt/Argon2 có thêm cơ chế chống brute-force phần cứng chuyên dụng — GPU/ASIC — mà lặp SHA-256 thuần không có). Đây là lựa chọn tốt nhất **trong giới hạn nền tảng Apps Script**, phù hợp hệ thống nội bộ quy mô nhỏ (vài chục người dùng), **không phù hợp** nếu hệ thống đối mặt Internet công khai quy mô lớn hoặc dữ liệu cực kỳ nhạy cảm — khi đó nên cân nhắc nền tảng khác có thư viện băm mật khẩu chuyên dụng.

So sánh hash khi đăng nhập dùng constant-time compare (`_constantTimeEquals_`) — hạn chế rò rỉ thông tin qua thời gian phản hồi.

## 5. Luồng đăng nhập

```
Client (Index.html)                    Server (Core.gs → Auth.gs)
  |  nhập tên đăng nhập + mật khẩu          |
  |----------- login(id, pw) -------------->|
  |                                          | 1. Tìm user theo TEN_DANG_NHAP
  |                                          | 2. Kiểm tra LOCKED_UNTIL, TRANG_THAI
  |                                          | 3. Băm mật khẩu nhập vào, so constant-time
  |                                          |    - Sai: tăng FAILED_LOGIN_COUNT, khoá tạm
  |                                          |      nếu vượt ngưỡng (MAX_FAILED_LOGIN_ATTEMPTS)
  |                                          |    - Đúng: reset bộ đếm, tạo _SESSIONS mới
  |<---------- {token, user} ---------------|
  |  lưu token vào localStorage             |
  |                                          |
  |  mọi lời gọi sau: kèm token              |
  |----- getCurrentUserInfo(token) -------->|
  |                                          | Auth._resolveSession_(token):
  |                                          |  - Tra _SESSIONS theo token, kiểm tra EXPIRES_AT
  |                                          |  - Tra 25_NGUOI_DUNG theo USER_ID trong session
  |                                          |  - Tra vai trò/quyền theo VAI_TRO_ID
  |<---------- user đầy đủ ------------------|
```

Thông báo lỗi đăng nhập sai **luôn dùng chung 1 câu** ("Tên đăng nhập hoặc mật khẩu không đúng") bất kể lỗi do tên đăng nhập không tồn tại hay mật khẩu sai — tránh lộ cho người dò quét biết tên đăng nhập nào có thật trong hệ thống.

## 6. Rate limiting / khoá tạm

- `MAX_FAILED_LOGIN_ATTEMPTS` (mặc định 5) lần sai liên tiếp → khoá `LOGIN_LOCKOUT_MINUTES` (mặc định 15) phút, tự reset khi đăng nhập đúng.
- Đây là cơ chế **thay thế** cho việc Google tự chặn brute-force ở trang đăng nhập của họ — vì giờ không còn dùng trang đăng nhập Google nữa, tự app phải lo việc này.

## 7. Đổi mật khẩu tự phục vụ

`Auth.changePassword(token, oldPassword, newPassword)` — bắt buộc nhập đúng mật khẩu cũ (không chỉ dựa vào token còn hiệu lực), đề phòng token bị lộ trên thiết bị dùng chung vẫn không đổi được mật khẩu người khác. Luồng vận hành dự kiến: Admin tạo tài khoản mới với mật khẩu mặc định dùng chung → nhân viên tự đăng nhập lần đầu → tự đổi sang mật khẩu riêng.

## 8. Cấp tài khoản Super Admin đầu tiên (bootstrap)

`SetupSheets.gs` có hàm `seedInitialData()` — **chỉ chạy tay từ Apps Script editor**, không có đường gọi nào từ `Core.gs`/web app. Đọc `TEN_DANG_NHAP`/mật khẩu ban đầu từ **Script Properties** (`INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD`) — không hardcode bất kỳ thông tin đăng nhập nào trong code/Git. Có guard `BOOTSTRAP_COMPLETED` chống chạy trùng; xoá mật khẩu khỏi Script Properties ngay sau khi dùng.

**Vì sao đây không phải cổng sau**: đây là hàm *duy nhất* có thể tạo Super Admin, nhưng nó không thể gọi được qua mạng — chỉ chạy được nếu có quyền truy cập trực tiếp vào project Apps Script (ranh giới tin cậy tương đương quyền chỉnh sửa code), không reachable từ `google.script.run`/trình duyệt.

## 9. Bảng đối chiếu bảo mật

| Nguy cơ | Cách chặn |
|---|---|
| Người dùng tự sửa Sheet trực tiếp, bỏ qua app | Không ai (ngoài người deploy) có quyền Editor trên Sheet — `executeAs: USER_DEPLOYING`, không `addEditor()` cho ai |
| Đoán/vét cạn mật khẩu | Băm SHA-256 lặp nhiều vòng + muối riêng; khoá tạm sau N lần sai |
| Đoán token phiên | Token = UUID ngẫu nhiên (không phải ID tuần tự) |
| Lộ token phiên trên thiết bị dùng chung | Đổi mật khẩu vẫn cần mật khẩu cũ, không chỉ token |
| Dò tên đăng nhập tồn tại qua thông báo lỗi | 1 thông báo lỗi chung cho mọi trường hợp sai |
| Client tự xưng vai trò/quyền | Server luôn tự tra lại danh tính từ token, không nhận tham số "role" từ client |
| Rò rỉ chi tiết lỗi hệ thống ra client | Mọi lỗi không phải `AppError` bị chặn ở `_invokeController_`, chỉ trả mã lỗi chung |

## 10. Áp dụng lại cho dự án Apps Script khác — checklist

1. Copy `Auth.gs` (đổi tên module nếu cần) — giữ nguyên cơ chế băm/token/rate-limit, sửa lại tên sheet/cột nếu schema khác.
2. Copy phần `insertRow`/`updateRowById`/`getById`/`findOne`/`list` kiểu Repository trong `Database.gs` nếu dự án chưa có tầng tương tự — `Auth.gs` phụ thuộc các hàm này.
3. Thêm bảng người dùng (tối thiểu: `TEN_DANG_NHAP`, `PASSWORD_HASH`, `PASSWORD_SALT`, `FAILED_LOGIN_COUNT`, `LOCKED_UNTIL`, `TRANG_THAI`) và 1 bảng `_SESSIONS` riêng (không phải bảng nghiệp vụ).
4. `appsscript.json`: `"executeAs": "USER_DEPLOYING"`, `"access": "ANYONE_ANONYMOUS"` (hoặc `"ANYONE"` nếu vẫn muốn yêu cầu có tài khoản Google trước khi vào trang đăng nhập — tuỳ nhu cầu).
5. `Core.gs`: expose `login(loginId, password)`, `logout(token)`, `changePassword(token, old, new)`, và bọc mọi hàm nghiệp vụ khác để nhận `token` làm tham số đầu, gọi `Auth.assertPermission(token, module, action)` trước khi xử lý.
6. Frontend: form đăng nhập, lưu token vào `localStorage`, luôn gửi kèm token trong mọi lời gọi `google.script.run` tới hàm cần đăng nhập.
7. Viết hàm `seedInitialData()` kiểu tương tự — đọc thông tin admin đầu tiên từ Script Properties, không hardcode, không expose qua Core.gs.
