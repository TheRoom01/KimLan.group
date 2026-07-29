import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";


function normalizeOwnerPhone(
  phone: string,
) {
  const digits =
    phone.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.startsWith("00")) {
    return "+" + digits.slice(2);
  }

  if (digits.startsWith("0")) {
    return "+84" + digits.slice(1);
  }

  if (digits.startsWith("84")) {
    return "+84" + digits.slice(2);
  }

  return "+" + digits;
}


export async function POST(
  request: Request,
) {
  try {
    const body =
      await request.json();


    const phone =
      typeof body.phone === "string"
        ? body.phone
        : "";


    const phoneNormalized =
      normalizeOwnerPhone(phone);


    /*
      Luôn trả response chung
      để tránh dò tài khoản
    */

    const successResponse =
      NextResponse.json({
        ok: true,
        message:
          "Nếu số điện thoại tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi tới email đăng ký.",
      });


    if (!phoneNormalized) {
      return successResponse;
    }


    const admin =
      createSupabaseAdminClient();


    /*
      Tìm Owner theo SĐT
    */

    const {
      data: phoneRecord,
    } =
      await admin
        .from(
          "member_contact_phones",
        )
        .select(
          "user_id",
        )
        .eq(
          "phone_normalized",
          phoneNormalized,
        )
        .eq(
          "is_verified",
          true,
        )
        .maybeSingle();


    if (!phoneRecord) {
      return successResponse;
    }


    /*
      Lấy email Auth
      chỉ ở server
    */

    const {
      data: authUser,
      error,
    } =
      await admin.auth.admin.getUserById(
        phoneRecord.user_id,
      );


    if (
      error ||
      !authUser.user?.email
    ) {
      return successResponse;
    }


    /*
      Gửi email reset password
    */

    const {
      error: resetError,
    } =
      await admin.auth.resetPasswordForEmail(
        authUser.user.email,
        {
          redirectTo:
            `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
        },
      );


    if (resetError) {
      console.error(
        "owner password reset error",
        resetError,
      );
    }


    return successResponse;


  } catch(error) {

    console.error(
      "owner forgot password error",
      error,
    );


    /*
      Không trả lỗi chi tiết
      tránh leak thông tin
    */

    return NextResponse.json({
      ok:true,
      message:
        "Nếu số điện thoại tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi tới email đăng ký.",
    });
  }
}