export function deviceExitMessage(status: string | null) {
  if (status === "kicked") {
    return "Tài khoản vừa đăng nhập trên thiết bị thứ ba. Thiết bị này đã bị đăng xuất.";
  }
  if (status === "signed-out") {
    return "Phiên đăng nhập trên thiết bị này đã kết thúc. Vui lòng đăng nhập lại.";
  }
  return null;
}
