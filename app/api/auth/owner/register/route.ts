import { NextResponse } from "next/server";
import crypto from "crypto";

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


function hashCode(
  code: string,
) {
  return crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
}


function generateCode() {
  return Math.floor(
    100000 +
      Math.random() * 900000,
  ).toString();
}


export async function POST(
  request: Request,
) {
  try {
    const body =
      await request.json();


    const fullName =
      typeof body.fullName === "string"
        ? body.fullName.trim()
        : "";


    const phone =
      typeof body.phone === "string"
        ? body.phone
        : "";


    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";


    const password =
      typeof body.password === "string"
        ? body.password
        : "";


    const phoneNormalized =
      normalizeOwnerPhone(phone);


    if (
      !fullName ||
      !phoneNormalized ||
      !email ||
      password.length < 8
    ) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Thông tin đăng ký không hợp lệ",
        },
        {
          status:400,
        },
      );
    }


    const admin =
      createSupabaseAdminClient();


    /*
      Kiểm tra số điện thoại đã tồn tại
    */

    const {
      data: phoneExists,
    } =
      await admin
        .from(
          "member_contact_phones",
        )
        .select(
          "id",
        )
        .eq(
          "phone_normalized",
          phoneNormalized,
        )
        .maybeSingle();


    if (phoneExists) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Số điện thoại đã được đăng ký",
        },
        {
          status:400,
        },
      );
    }


    /*
      Kiểm tra email Auth
    */

    const {
      data: users,
    } =
      await admin.auth.admin.listUsers();


    const existedEmail =
      users.users.some(
        (user) =>
          user.email?.toLowerCase() ===
          email,
      );


    if (existedEmail) {
      return NextResponse.json(
        {
          ok:false,
          message:
            "Email đã được sử dụng",
        },
        {
          status:400,
        },
      );
    }


    /*
      Tạo OTP email
    */

    const code =
      generateCode();


    /*
      TODO:
      Tích hợp email provider tại đây.
      Ví dụ:
      AUTH_EMAIL_OTP_WEBHOOK_URL
    */


    const expires =
      new Date(
        Date.now() + 10 * 60 * 1000,
      );


    await admin
      .from(
        "owner_registration_verifications",
      )
      .upsert(
        {
          email,
          phone_normalized:
            phoneNormalized,
          full_name:
            fullName,
          password_ciphertext:
            password,
          code_hash:
            hashCode(code),
          expires_at:
            expires.toISOString(),
        },
        {
          onConflict:
            "email",
        },
      );


    console.log(
      "OWNER EMAIL OTP:",
      code,
    );


    return NextResponse.json({
      ok:true,
      message:
        "Mã xác minh đã được gửi tới email",
    });


  } catch(error) {

    console.error(
      "owner register error",
      error,
    );


    return NextResponse.json(
      {
        ok:false,
        message:
          "Không thể đăng ký",
      },
      {
        status:500,
      },
    );
  }
}